/**
 * ADR-066: a fraction of queue items are anchors — conflicts whose correct
 * answer is independently established (physical measurement, manufacturer
 * erratum, or an item resolved by escalation with the unit in hand). Kappa is
 * computed against anchors where available and against consensus only as a
 * fallback, with the two reported separately and never averaged.
 *
 * Without anchors, reviewer calibration measures conformity, not accuracy.
 */
export type Anchor = {
  readonly conflictId: string;
  readonly correctOptionToken: string;
  readonly basis: 'measured' | 'manufacturer_erratum' | 'escalated_physical';
  readonly establishedAt: string;
};

/** Target share of the queue that must be anchored for calibration to be valid. */
export const MIN_ANCHOR_SHARE = 0.08;

export const calibrationValidity = (anchoredOverlap: number, totalOverlap: number) =>
  totalOverlap === 0
    ? { valid: false as const, reason: 'no overlap' }
    : anchoredOverlap / totalOverlap >= MIN_ANCHOR_SHARE
      ? { valid: true as const, anchoredShare: anchoredOverlap / totalOverlap }
      : { valid: false as const, reason: 'insufficient anchored items; kappa measures conformity only' };
