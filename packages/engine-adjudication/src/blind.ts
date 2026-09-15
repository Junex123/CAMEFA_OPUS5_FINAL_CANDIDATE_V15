import { contentHash } from '@camefa/engine-kernel';
import type { ConflictGroup } from './conflict.js';

/**
 * ADR-063: adjudication is source-blind by default. A reviewer who can see that
 * option A came from the manufacturer and option B from a forum post will pick
 * A, and that choice then feeds the reliability model that told them to trust A.
 * The loop is self-confirming and the resulting scores measure the reviewer's
 * priors, not the sources' accuracy.
 *
 * Blinding breaks the loop: only blind adjudications carry weight in
 * `scoreSource`. Unblinding is permitted but permanently marked.
 */
export type BlindOption = {
  /** Stable per-conflict pseudonym: 'A', 'B', 'C'. Never a source hint. */
  readonly label: string;
  readonly value: unknown;
  /** Verbatim excerpt IS shown — the reviewer must judge the evidence itself. */
  readonly excerpt: string | null;
  /** Number of distinct sources asserting this value, without naming them. */
  readonly supportCount: number;
  /** Opaque handle the server maps back to claim ids. */
  readonly optionToken: string;
};

export type BlindPresentation = {
  readonly conflictId: string;
  readonly entityLabel: string;
  readonly attributeLabel: string;
  readonly attributeDescription: string;
  readonly unit: string | null;
  readonly options: readonly BlindOption[];
  /** Peer distribution for context. Contains no source identities. */
  readonly cohortSummary: { readonly median: number; readonly p10: number; readonly p90: number; readonly n: number } | null;
  readonly blinded: true;
};

/**
 * Deterministic shuffle keyed on conflictId, so the same conflict presents in
 * the same order to every reviewer — required for inter-rater agreement to be
 * measurable — while carrying no correlation with source identity.
 */
const seededOrder = <T>(items: readonly T[], seed: string): T[] => {
  const keyed = items.map((item, i) => ({ item, k: contentHash({ seed, i }) }));
  return keyed.sort((a, b) => (a.k < b.k ? -1 : 1)).map((x) => x.item);
};

export const presentBlind = (args: {
  conflict: ConflictGroup;
  entityLabel: string;
  attributeLabel: string;
  attributeDescription: string;
  unit: string | null;
  cohort: readonly number[];
}): BlindPresentation => {
  const byValue = new Map<string, { value: unknown; sources: Set<string>; excerpt: string | null }>();

  for (const c of args.conflict.claims) {
    const k = JSON.stringify(c.value);
    const entry = byValue.get(k) ?? { value: c.value, sources: new Set<string>(), excerpt: null };
    entry.sources.add(c.sourceId);
    // Prefer the longest excerpt: more surrounding text, more judgeable.
    const ex = c.provenance?.excerpt ?? null;
    if (ex && (entry.excerpt === null || ex.length > entry.excerpt.length)) entry.excerpt = ex;
    byValue.set(k, entry);
  }

  const shuffled = seededOrder([...byValue.entries()], args.conflict.conflictId);
  const options: BlindOption[] = shuffled.map(([k, v], i) => ({
    label: String.fromCharCode(65 + i),
    value: v.value,
    excerpt: v.excerpt,
    supportCount: v.sources.size,
    optionToken: contentHash({ c: args.conflict.conflictId, v: k }),
  }));

  const sorted = [...args.cohort].filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;

  return {
    conflictId: args.conflict.conflictId,
    entityLabel: args.entityLabel,
    attributeLabel: args.attributeLabel,
    attributeDescription: args.attributeDescription,
    unit: args.unit,
    options,
    cohortSummary: sorted.length >= 5
      ? { median: at(50), p10: at(10), p90: at(90), n: sorted.length }
      : null,
    blinded: true,
  };
};

/** Token → claim ids. Held server-side; never sent to the reviewer. */
export const optionTokenMap = (conflict: ConflictGroup): ReadonlyMap<string, readonly string[]> => {
  const m = new Map<string, string[]>();
  for (const c of conflict.claims) {
    const token = contentHash({ c: conflict.conflictId, v: JSON.stringify(c.value) });
    (m.get(token) ?? m.set(token, []).get(token)!).push(c.id);
  }
  return m;
};
