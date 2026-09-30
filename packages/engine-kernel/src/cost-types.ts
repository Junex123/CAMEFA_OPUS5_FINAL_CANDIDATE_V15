export type CostDimension = 'evidenceReads' | 'derivations' | 'scoringPasses' | 'wallClockMs';
export type CostAllowance = Readonly<Record<CostDimension, number>>;
export interface CostBudget extends CostAllowance { readonly fragility: CostAllowance; }
export interface CostReport extends CostAllowance {
  readonly fragility: CostAllowance & { readonly exhausted: boolean };
}
