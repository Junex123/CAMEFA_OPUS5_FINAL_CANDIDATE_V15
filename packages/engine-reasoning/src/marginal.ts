import type { Evaluation } from './evaluate.js';

export interface MarginalGain {
  readonly deltaScore: number;
  readonly perceptible: boolean;
  readonly significant: boolean;
  readonly resolves: readonly string[];
  readonly verdict: 'worthwhile' | 'lateral' | 'regression';
}

/** One JND of aggregate score. Below this the change is not noticeable in use. */
const AGGREGATE_JND = 0.03;

export const marginalGain = (before: Evaluation, after: Evaluation): MarginalGain => {
  const delta = after.score.point - before.score.point;
  const beforeViolations = new Set(before.binding);
  const resolves = [...beforeViolations].filter((id) => !after.binding.includes(id));

  // Rigorous test: the worst plausible outcome of the upgrade must beat the
  // best plausible outcome of the current kit.
  const significant = after.score.lower > before.score.upper;

  return {
    deltaScore: delta,
    perceptible: Math.abs(delta) >= AGGREGATE_JND,
    significant,
    resolves,
    verdict: delta <= -AGGREGATE_JND ? 'regression' : significant ? 'worthwhile' : 'lateral',
  };
};
