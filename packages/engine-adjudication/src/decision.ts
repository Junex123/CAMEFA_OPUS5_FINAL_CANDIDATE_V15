import { contentHash, ok, err, type Result } from '@camefa/engine-kernel';
import type { Adjudication } from '@camefa/engine-ingest';
import { optionTokenMap, type BlindPresentation } from './blind.js';
import type { ConflictGroup } from './conflict.js';

/**
 * ADR-064: adjudications are events, never mutations. The ledger stays
 * immutable, the reviewer's judgement is a separate assertion with its own
 * provenance, and a reviewer who turns out to be systematically wrong can be
 * down-weighted retroactively without rewriting any claim.
 */
export type AdjudicationVerdict =
  | { readonly kind: 'select'; readonly optionToken: string }
  | { readonly kind: 'reject_all'; readonly note: string }
  | { readonly kind: 'both_valid_over_time'; readonly boundary: string }
  | { readonly kind: 'escalate'; readonly note: string }
  | { readonly kind: 'abstain'; readonly note: string };

export type AdjudicationEvent = {
  readonly eventId: string;
  readonly conflictId: string;
  readonly reviewerId: string;
  readonly at: string;
  readonly verdict: AdjudicationVerdict;
  readonly blinded: boolean;
  /** Set when the reviewer chose to unblind. Kills reliability weighting. */
  readonly unblindReason: string | null;
  /** Reviewer's own confidence, 1–5 ordinal. */
  readonly certainty: 1 | 2 | 3 | 4 | 5;
  readonly elapsedMs: number;
};

export type AdjudicationFailure =
  | { readonly code: 'UNKNOWN_OPTION' }
  | { readonly code: 'SUSPICIOUS_LATENCY'; readonly elapsedMs: number }
  | { readonly code: 'REVIEWER_NOT_ELIGIBLE'; readonly reason: string };

/** Below this, the reviewer cannot have read the excerpts. */
const MIN_ELAPSED_MS = 2_500;

export const recordAdjudication = (args: {
  presentation: BlindPresentation;
  conflict: ConflictGroup;
  reviewerId: string;
  at: string;
  verdict: AdjudicationVerdict;
  certainty: AdjudicationEvent['certainty'];
  elapsedMs: number;
  unblindReason: string | null;
  /** Reviewer must not adjudicate a conflict they contributed a source to. */
  reviewerSourceIds: readonly string[];
}): Result<{ event: AdjudicationEvent; adjudications: readonly Adjudication[] }, AdjudicationFailure> => {
  const conflictSources = new Set(args.conflict.claims.map((c) => c.sourceId));
  const conflicted = args.reviewerSourceIds.find((s) => conflictSources.has(s));
  if (conflicted) {
    return err({ code: 'REVIEWER_NOT_ELIGIBLE', reason: `reviewer owns source ${conflicted}` });
  }

  if (args.elapsedMs < MIN_ELAPSED_MS && args.verdict.kind === 'select') {
    return err({ code: 'SUSPICIOUS_LATENCY', elapsedMs: args.elapsedMs });
  }

  const tokens = optionTokenMap(args.conflict);
  if (args.verdict.kind === 'select' && !tokens.has(args.verdict.optionToken)) {
    return err({ code: 'UNKNOWN_OPTION' });
  }

  const event: AdjudicationEvent = {
    eventId: contentHash({
      c: args.conflict.conflictId, r: args.reviewerId, t: args.at, v: args.verdict,
    }),
    conflictId: args.conflict.conflictId,
    reviewerId: args.reviewerId,
    at: args.at,
    verdict: args.verdict,
    blinded: args.unblindReason === null,
    unblindReason: args.unblindReason,
    certainty: args.certainty,
    elapsedMs: args.elapsedMs,
  };

  // Only a blind, confident selection tells us anything about source accuracy.
  // Abstentions, escalations, and unblinded picks produce an empty log — the
  // safest possible contribution to the reliability model is none.
  if (
    event.verdict.kind !== 'select' ||
    !event.blinded ||
    event.certainty < 3
  ) {
    return ok({ event, adjudications: [] });
  }

  const winningClaimIds = new Set(tokens.get(event.verdict.optionToken)!);
  const adjudications: Adjudication[] = [];
  const seen = new Set<string>();

  for (const c of args.conflict.claims) {
    // One vote per source per conflict, so a source asserting the same value
    // across five mirrors does not earn five credits.
    const k = `${c.sourceId}\u0000${c.attributeKey}`;
    if (seen.has(k)) continue;
    seen.add(k);

    adjudications.push({
      sourceId: c.sourceId,
      attributeKey: c.attributeKey,
      outcome: winningClaimIds.has(c.id) ? 'agreed' : 'disagreed',
      at: args.at,
    });
  }

  return ok({ event, adjudications });
};

/**
 * Applied resolution is a derived projection over the event log, recomputable
 * from scratch. It never edits a claim; it writes a superseding assertion whose
 * source is the adjudication itself (ADR-021 policy resolution).
 */
export type ResolutionProjection = {
  readonly conflictId: string;
  readonly status: 'resolved' | 'escalated' | 'open' | 'contested';
  readonly winningClaimIds: readonly string[];
  readonly supersededClaimIds: readonly string[];
  readonly decidedBy: readonly string[];
  readonly decidedAt: string | null;
};

const REQUIRED_CONCURRENCE = 2;

export const projectResolution = (
  conflict: ConflictGroup,
  events: readonly AdjudicationEvent[],
): ResolutionProjection => {
  const relevant = events
    .filter((e) => e.conflictId === conflict.conflictId)
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  if (relevant.some((e) => e.verdict.kind === 'escalate')) {
    return { conflictId: conflict.conflictId, status: 'escalated', winningClaimIds: [], supersededClaimIds: [], decidedBy: relevant.map((e) => e.reviewerId), decidedAt: null };
  }

  const selections = relevant.filter((e) => e.verdict.kind === 'select');
  if (selections.length === 0) {
    return { conflictId: conflict.conflictId, status: 'open', winningClaimIds: [], supersededClaimIds: [], decidedBy: [], decidedAt: null };
  }

  // Distinct reviewers per option; a single reviewer cannot self-concur.
  const tally = new Map<string, Set<string>>();
  for (const e of selections) {
    const token = (e.verdict as { optionToken: string }).optionToken;
    (tally.get(token) ?? tally.set(token, new Set()).get(token)!).add(e.reviewerId);
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1].size - a[1].size);
  const [topToken, topReviewers] = ranked[0]!;

  // Material and contradictory conflicts need concurrence; minor ones do not.
  const needed = conflict.severity === 'minor' ? 1 : REQUIRED_CONCURRENCE;

  if (ranked.length > 1 && ranked[1]![1].size === topReviewers.size) {
    return { conflictId: conflict.conflictId, status: 'contested', winningClaimIds: [], supersededClaimIds: [], decidedBy: [...topReviewers], decidedAt: null };
  }
  if (topReviewers.size < needed) {
    return { conflictId: conflict.conflictId, status: 'open', winningClaimIds: [], supersededClaimIds: [], decidedBy: [...topReviewers], decidedAt: null };
  }

  const tokens = optionTokenMap(conflict);
  const winning = new Set(tokens.get(topToken) ?? []);

  return {
    conflictId: conflict.conflictId,
    status: 'resolved',
    winningClaimIds: [...winning].sort(),
    supersededClaimIds: conflict.claims.filter((c) => !winning.has(c.id)).map((c) => c.id).sort(),
    decidedBy: [...topReviewers].sort(),
    decidedAt: selections[selections.length - 1]!.at,
  };
};
