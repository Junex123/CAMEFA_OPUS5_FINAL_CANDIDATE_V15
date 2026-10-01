export type CostDimension = 'evidenceReads' | 'derivations' | 'scoringPasses' | 'wallClockMs';
export type CostAllowance = Readonly<Record<CostDimension, number>>;
export interface CostBudget extends CostAllowance { readonly fragility: CostAllowance; }
export interface CostReport extends CostAllowance { readonly fragility: CostAllowance & { readonly exhausted: boolean }; }

export interface CostSink {
  charge(dimension: CostDimension, amount?: number): void;
  spend?(dimension: CostDimension, amount: number): void;
}
export const COST_DIMENSIONS: readonly CostDimension[] = Object.freeze(['evidenceReads', 'derivations', 'scoringPasses', 'wallClockMs']);
const zero = (): Record<CostDimension, number> => ({ evidenceReads: 0, derivations: 0, scoringPasses: 0, wallClockMs: 0 });
const unboundedAllowance = (): CostAllowance => ({ evidenceReads: Infinity, derivations: Infinity, scoringPasses: Infinity, wallClockMs: Infinity });
const unboundedBudget = (): CostBudget => ({ ...unboundedAllowance(), fragility: unboundedAllowance() });
export class BudgetExhaustedError extends Error {
  constructor(readonly dimension: CostDimension, readonly spent: number, readonly budget: number) { super('budget exhausted: ' + dimension + ' exceeded ' + budget); this.name = 'BudgetExhaustedError'; }
}
export const BudgetExceeded = BudgetExhaustedError;
export class SoftCostScope {
  private readonly used: Record<CostDimension, number> = zero();
  private exhaustedAt: CostDimension | undefined;
  constructor(private readonly allowance: CostAllowance = unboundedAllowance()) {}
  tryCharge(dimension: CostDimension, amount = 1): boolean {
    if (!Number.isFinite(amount) || amount < 0 || this.exhaustedAt !== undefined) return false;
    if (amount === 0) return true;
    const next = this.used[dimension] + amount;
    if (next > this.allowance[dimension]) { this.exhaustedAt = dimension; return false; }
    this.used[dimension] = next; return true;
  }
  get exhausted(): boolean { return this.exhaustedAt !== undefined; }
  report(): CostAllowance & { exhausted: boolean } { return { ...this.used, exhausted: this.exhausted }; }
}
export class CostMeter implements CostSink {
  private readonly used: Record<CostDimension, number> = zero();
  private readonly child: SoftCostScope;
  constructor(private readonly budget: CostBudget = unboundedBudget()) { this.child = new SoftCostScope(budget.fragility); }
  charge(dimension: CostDimension, amount = 1): void {
    if (!Number.isFinite(amount) || amount < 0) throw new TypeError('invalid cost amount: ' + amount);
    if (amount === 0) return;
    const next = this.used[dimension] + amount; const limit = this.budget[dimension];
    if (next > limit) throw new BudgetExhaustedError(dimension, next, limit);
    this.used[dimension] = next;
  }
  spend(dimension: CostDimension, amount: number): void { this.charge(dimension, amount); }
  get fragility(): SoftCostScope { return this.child; }
  spent(dimension: CostDimension): number { return this.used[dimension]; }
  remaining(dimension: CostDimension): number { return Math.max(0, this.budget[dimension] - this.used[dimension]); }
  snapshot(): Readonly<CostAllowance> { return { ...this.used }; }
  report(): CostReport { return { ...this.used, fragility: this.child.report() }; }
}
export const emptyReport = (): CostReport => ({ ...zero(), fragility: { ...zero(), exhausted: false } });
export const dimensionsOf = (): readonly CostDimension[] => COST_DIMENSIONS;
export function addCost(a: Partial<CostAllowance>, b: Partial<CostAllowance>): Partial<CostAllowance> {
  const out: Partial<Record<CostDimension, number>> = {};
  for (const d of COST_DIMENSIONS) { const sum = (a[d] ?? 0) + (b[d] ?? 0); if (sum !== 0) out[d] = sum; }
  return out;
}
export const NULL_SINK: CostSink = { charge: () => {}, spend: () => {} };
