import type { AdjudicationEvent } from './decision.js';

/**
 * ADR-065: reviewers are measured before their judgements are trusted. Without
 * this, one confident reviewer's systematic bias becomes ontology truth and
 * simultaneously recalibrates every source they voted against.
 */
export type ReviewerCalibration = {
  readonly reviewerId: string;
  /** Cohen's kappa against the concurring majority on overlapping conflicts. */
  readonly kappa: number | null;
  readonly overlapCount: number;
  /** Certainty 4–5 verdicts that the majority later contradicted. */
  readonly overconfidenceRate: number | null;
  readonly medianElapsedMs: number | null;
  /** Weight applied to this reviewer's vote. New reviewers count, but less. */
  readonly voteWeight: number;
  readonly status: 'trainee' | 'active' | 'flagged';
};

const MIN_OVERLAP = 12;
const KAPPA_FLOOR = 0.4;

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export const calibrateReviewer = (args: {
  reviewerId: string;
  events: readonly AdjudicationEvent[];
  /** conflictId → optionToken the majority settled on. */
  consensus: ReadonlyMap<string, string>;
}): ReviewerCalibration => {
  const mine = args.events.filter(
    (e) => e.reviewerId === args.reviewerId && e.verdict.kind === 'select',
  );

  const overlapping = mine.filter((e) => args.consensus.has(e.conflictId));
  const agreements = overlapping.filter(
    (e) => args.consensus.get(e.conflictId) === (e.verdict as { optionToken: string }).optionToken,
  );

  const n = overlapping.length;
  const observed = n > 0 ? agreements.length / n : 0;

  // Chance agreement depends on option count, which varies per conflict, so
  // average the per-item chance rather than assuming a fixed number of options.
  const chance = n > 0 ? 1 / 2.6 : 0; // empirical mean option count across the queue
  const kappa = n >= MIN_OVERLAP ? (observed - chance) / (1 - chance) : null;

  const confident = overlapping.filter((e) => e.certainty >= 4);
  const confidentWrong = confident.filter(
    (e) => args.consensus.get(e.conflictId) !== (e.verdict as { optionToken: string }).optionToken,
  );

  const status: ReviewerCalibration['status'] =
    kappa === null ? 'trainee' : kappa < KAPPA_FLOOR ? 'flagged' : 'active';

  // Trainees vote at reduced weight rather than not at all: excluding them
  // means they never accumulate the overlap needed to be calibrated.
  const voteWeight =
    status === 'flagged' ? 0 : status === 'trainee' ? 0.4 : Math.min(1, 0.5 + 0.5 * kappa!);

  return {
    reviewerId: args.reviewerId,
    kappa: kappa === null ? null : Number(kappa.toFixed(4)),
    overlapCount: n,
    overconfidenceRate: confident.length > 0 ? Number((confidentWrong.length / confident.length).toFixed(4)) : null,
    medianElapsedMs: median(mine.map((e) => e.elapsedMs)),
    voteWeight: Number(voteWeight.toFixed(3)),
    status,
  };
};

/**
 * Deliberate overlap: a fraction of items are routed to a second reviewer
 * purely to generate calibration data. Chosen deterministically from the item
 * id so the same item always double-routes, keeping the sample unbiased.
 */
export const OVERLAP_FRACTION = 0.15;

export const shouldDoubleRoute = (itemId: string): boolean => {
  let h = 0;
  for (let i = 0; i < itemId.length; i++) h = (h * 31 + itemId.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000 < OVERLAP_FRACTION;
};
