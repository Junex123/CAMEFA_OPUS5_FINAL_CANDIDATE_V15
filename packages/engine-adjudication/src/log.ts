import { canonicalHash } from '@camefa/engine-contracts';

export type ResolutionBasis =
  | 'anchor_measurement'
  | 'source_reliability'
  | 'reviewer_judgement'
  | 'escalation';

export interface AdjudicationEvent {
  eventId: string;
  conflictId: string;
  compositionHash: string;
  reviewerId: string;
  acceptedClaimIds: string[];
  rejectedClaimIds: string[];
  basis: ResolutionBasis;
  publicNote: string | null;
  privateNote: string | null;
  decidedAt: string;
  /** Hash of the preceding event for this conflict; null for the first. */
  previousEventId: string | null;
  chainHash: string;
}

export class LogError extends Error {}

function eventPayload(e: Omit<AdjudicationEvent, 'eventId' | 'chainHash'>): unknown {
  return {
    conflictId: e.conflictId,
    compositionHash: e.compositionHash,
    reviewerId: e.reviewerId,
    acceptedClaimIds: [...e.acceptedClaimIds].sort(),
    rejectedClaimIds: [...e.rejectedClaimIds].sort(),
    basis: e.basis,
    publicNote: e.publicNote,
    privateNote: e.privateNote,
    decidedAt: e.decidedAt,
    previousEventId: e.previousEventId,
  };
}

/**
 * Append-only, hash-chained per conflict (ADR-064). A reversal is a new event
 * referencing the old one, never an edit — the point of the log is to show that
 * a decision was revisited, which an in-place update destroys.
 */
export function sealEvent(
  draft: Omit<AdjudicationEvent, 'eventId' | 'chainHash'>,
  previousChainHash: string | null,
): AdjudicationEvent {
  const payload = eventPayload(draft);
  const eventId = canonicalHash(payload);
  return {
    ...draft,
    eventId,
    chainHash: canonicalHash({ previousChainHash, eventId }),
  };
}

export function verifyChain(events: readonly AdjudicationEvent[]): {
  valid: boolean;
  brokenAt: string | null;
} {
  let previousChainHash: string | null = null;
  let previousEventId: string | null = null;

  for (const e of events) {
    if (e.previousEventId !== previousEventId) {
      return { valid: false, brokenAt: e.eventId };
    }
    const expectedId = canonicalHash(eventPayload(e));
    if (expectedId !== e.eventId) return { valid: false, brokenAt: e.eventId };
    if (canonicalHash({ previousChainHash, eventId: e.eventId }) !== e.chainHash) {
      return { valid: false, brokenAt: e.eventId };
    }
    previousChainHash = e.chainHash;
    previousEventId = e.eventId;
  }
  return { valid: true, brokenAt: null };
}

export function currentResolution(
  events: readonly AdjudicationEvent[],
): AdjudicationEvent | null {
  return events.length === 0 ? null : events[events.length - 1] ?? null;
}

export function assertDisjoint(accepted: readonly string[], rejected: readonly string[]): void {
  const overlap = accepted.filter((a) => rejected.includes(a));
  if (overlap.length > 0) {
    throw new LogError(`claim(s) both accepted and rejected: ${overlap.join(', ')}`);
  }
  if (accepted.length === 0) {
    throw new LogError('a resolution must accept at least one claim, or be an escalation');
  }
}
