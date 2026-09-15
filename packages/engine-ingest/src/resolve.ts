import type { EntityId } from '@camefa/engine-kernel';

/**
 * ADR-056: resolution fails closed. A duplicate entity silently splits a
 * product's claims across two nodes, which degrades every downstream capability
 * with no visible symptom. A quarantined draft is a queue item someone clears.
 */
export type ResolutionOutcome =
  | { readonly kind: 'matched'; readonly entityId: EntityId; readonly score: number; readonly via: string }
  | { readonly kind: 'created'; readonly entityId: EntityId; readonly normalizedKey: string }
  | { readonly kind: 'quarantined'; readonly reason: QuarantineReason; readonly candidates: readonly Candidate[] };

export type QuarantineReason =
  | 'ambiguous_match'
  | 'below_match_threshold'
  | 'type_conflict'
  | 'unnormalizable_key';

export type Candidate = { readonly entityId: EntityId; readonly label: string; readonly score: number };

export type AliasIndexPort = {
  /** Exact lookup on a normalized alias. The fast, certain path. */
  byAlias(alias: string): Promise<{ entityId: EntityId; entityType: string } | null>;
  /** Trigram/token candidates for fuzzy fallback, already score-ordered. */
  search(normalizedKey: string, entityType: string, limit: number): Promise<readonly Candidate[]>;
  createEntity(normalizedKey: string, entityType: string, label: string): Promise<EntityId>;
  addAlias(entityId: EntityId, alias: string, sourceId: string): Promise<void>;
};

const AUTO_MATCH = 0.92;
const AMBIGUITY_MARGIN = 0.04;
const AUTO_CREATE_CEILING = 0.55;

/**
 * Normalization strips marketing noise that varies per retailer while
 * preserving the model-number tokens that actually identify a product.
 */
export const normalizeEntityKey = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/\((?:body only|kit|new|used|refurbished|open box)[^)]*\)/g, ' ')
    .replace(/\b(?:digital|mirrorless|dslr|camera|body only|body|full[- ]frame|aps-c)\b/g, ' ')
    .replace(/\b(?:with|w\/|incl\.?|including)\b.*$/g, ' ')
    .replace(/[®™©]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

/** Model numbers are the high-information tokens; a match without one is weak. */
const modelTokens = (key: string): string[] =>
  key.split(' ').filter((t) => /\d/.test(t) && t.length >= 2);

export const resolveEntity = async (args: {
  sourceEntityKey: string;
  entityType: string;
  sourceId: string;
  index: AliasIndexPort;
  allowCreate: boolean;
}): Promise<ResolutionOutcome> => {
  const normalized = normalizeEntityKey(args.sourceEntityKey);
  if (normalized.length < 3) {
    return { kind: 'quarantined', reason: 'unnormalizable_key', candidates: [] };
  }

  const exact = await args.index.byAlias(normalized);
  if (exact) {
    if (exact.entityType !== args.entityType) {
      // The same string naming a body on one source and a lens on another is a
      // data-quality signal worth a human look, never an auto-merge.
      return { kind: 'quarantined', reason: 'type_conflict', candidates: [] };
    }
    return { kind: 'matched', entityId: exact.entityId, score: 1, via: 'alias' };
  }

  const candidates = await args.index.search(normalized, args.entityType, 5);
  const best = candidates[0];
  const runnerUp = candidates[1];

  if (best && best.score >= AUTO_MATCH) {
    if (runnerUp && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
      return { kind: 'quarantined', reason: 'ambiguous_match', candidates };
    }
    // A high fuzzy score with no shared model number is usually two variants of
    // the same family, not the same product. Refuse it.
    const sourceModels = new Set(modelTokens(normalized));
    const bestModels = modelTokens(normalizeEntityKey(best.label));
    if (sourceModels.size > 0 && bestModels.length > 0 && !bestModels.some((t) => sourceModels.has(t))) {
      return { kind: 'quarantined', reason: 'ambiguous_match', candidates };
    }

    await args.index.addAlias(best.entityId, normalized, args.sourceId);
    return { kind: 'matched', entityId: best.entityId, score: best.score, via: 'fuzzy' };
  }

  // The dangerous middle band: too similar to create, too different to match.
  if (best && best.score > AUTO_CREATE_CEILING) {
    return { kind: 'quarantined', reason: 'below_match_threshold', candidates };
  }

  if (!args.allowCreate) {
    return { kind: 'quarantined', reason: 'below_match_threshold', candidates };
  }

  const entityId = await args.index.createEntity(normalized, args.entityType, args.sourceEntityKey.trim());
  await args.index.addAlias(entityId, normalized, args.sourceId);
  return { kind: 'created', entityId, normalizedKey: normalized };
};
