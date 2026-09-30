export type CostDimension = 'evidenceReads' | 'derivations' | 'scoringPasses' | 'wallClockMs';
export type CostAllowance = Readonly<Record<CostDimension, number>>;
export interface CostBudget extends CostAllowance { readonly fragility: CostAllowance; }
export interface CostReport extends CostAllowance {
  readonly fragility: CostAllowance & { readonly exhausted: boolean };
}
export type CostVector = Partial<Record<CostDimension, number>>;
export const ZERO_COST: Readonly<CostVector> = Object.freeze({});
export const COST_WEIGHTS: Readonly<Required<Record<CostDimension, number>>> = Object.freeze({
  evidenceReads: 1, derivations: 2, scoringPasses: 1, wallClockMs: 0.001,
});
export const costScalar = (c: CostVector): number =>
  (Object.keys(COST_WEIGHTS) as CostDimension[]).reduce((sum, k) => sum + (c[k] ?? 0) * COST_WEIGHTS[k], 0);
