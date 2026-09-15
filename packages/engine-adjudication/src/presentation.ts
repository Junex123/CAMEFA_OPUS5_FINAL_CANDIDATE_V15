import { createHash } from 'node:crypto';
import type { ClaimView } from './conflict.js';

export interface BlindClaim {
  /** Stable per (conflict, claim) so a reviewer can refer to "option B". */
  optionLabel: string;
  claimId: string;
  value: number;
  unit: string | null;
  approximate: boolean;
  precision: number;
  outlierFlags: string[];
  /** Deliberately absent: sourceId, reliability, observedAt. */
}

export interface BlindPresentation {
  conflictId: string;
  attribute: string;
  entityLabel: string;
  jndThreshold: number;
  options: BlindClaim[];
}

const LABELS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Source identity is withheld (ADR-063). A reviewer shown "manufacturer says
 * 670, blog says 690" will pick the manufacturer nearly every time, which
 * makes the adjudication a restatement of the reliability prior rather than
 * independent evidence about it — and reliability is then updated from its own
 * output (the ADR-066 loop).
 *
 * Ordering is a deterministic function of the conflictId, so it is stable
 * across page reloads but uncorrelated with reliability rank.
 */
export function presentBlind(
  conflictId: string,
  entityLabel: string,
  attribute: string,
  claims: readonly ClaimView[],
  jndThreshold: number,
): BlindPresentation {
  const keyed = claims.map((c) => ({
    claim: c,
    order: createHash('sha256').update(`${conflictId}:${c.claimId}`).digest('hex'),
  }));
  keyed.sort((a, b) => a.order.localeCompare(b.order));

  return {
    conflictId,
    attribute,
    entityLabel,
    jndThreshold,
    options: keyed.map(({ claim }, i) => ({
      optionLabel: LABELS[i % LABELS.length] + (i >= LABELS.length ? String(Math.floor(i / LABELS.length)) : ''),
      claimId: claim.claimId,
      value: claim.value,
      unit: claim.unit,
      approximate: claim.approximate,
      precision: claim.precision,
      outlierFlags: claim.outlierFlags,
    })),
  };
}
