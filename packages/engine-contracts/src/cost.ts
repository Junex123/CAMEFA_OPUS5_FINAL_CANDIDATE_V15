import type { CostAllowance, CostBudget, CostDimension, CostReport } from '@camefa/engine-kernel';
export type { CostAllowance, CostBudget, CostDimension, CostReport } from '@camefa/engine-kernel';

export type CostVector = Partial<Record<CostDimension, number>>;
export const ZERO_COST: Readonly<CostVector> = Object.freeze({});
export const COST_WEIGHTS: Readonly<Required<Record<CostDimension, number>>> = Object.freeze({
  evidenceReads: 1, derivations: 2, scoringPasses: 1, wallClockMs: 0.001,
});
export const costScalar = (c: CostVector): number =>
  (Object.keys(COST_WEIGHTS) as CostDimension[]).reduce((sum, k) => sum + (c[k] ?? 0) * COST_WEIGHTS[k], 0);
