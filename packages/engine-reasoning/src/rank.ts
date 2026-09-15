import type { Evaluation } from './evaluate.js';

export interface RankedGroup {
  readonly rank: number;
  readonly tied: readonly Evaluation[];
}

/**
 * Candidates whose score intervals overlap by more than `tolerance` of the
 * narrower interval are reported as statistically tied rather than ordered.
 */
export const rank = (evals: readonly Evaluation[], tolerance = 0.15): readonly RankedGroup[] => {
  const admitted = evals
    .filter((e) => e.admitted)
    .sort((a, b) => b.score.point - a.score.point || (a.target < b.target ? -1 : 1));

  const groups: Evaluation[][] = [];
  for (const e of admitted) {
    const current = groups.at(-1);
    if (current && overlaps(current[0]!, e, tolerance)) current.push(e);
    else groups.push([e]);
  }
  return groups.map((tied, i) => ({ rank: i + 1, tied }));
};

const overlaps = (a: Evaluation, b: Evaluation, tolerance: number): boolean => {
  const lo = Math.max(a.score.lower, b.score.lower);
  const hi = Math.min(a.score.upper, b.score.upper);
  if (hi <= lo) return false;
  const narrower = Math.min(a.score.upper - a.score.lower, b.score.upper - b.score.lower);
  return narrower <= 0 ? true : (hi - lo) / narrower >= tolerance;
};
