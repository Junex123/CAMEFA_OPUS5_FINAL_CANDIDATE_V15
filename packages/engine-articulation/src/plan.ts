import type { CapabilityKey, Brand } from '@camefa/engine-kernel';

export type PlanNodeId = Brand<string, 'PlanNodeId'>;

/** Hedge is computed from confidence, never chosen. Generation may hedge more, never less. */
export type HedgeLevel = 'assertive' | 'measured' | 'qualified' | 'speculative';

export const HEDGE_RANK: Record<HedgeLevel, number> = {
  assertive: 0, measured: 1, qualified: 2, speculative: 3,
};

export type PlanNodeRole =
  | 'verdict' | 'because' | 'tradeoff' | 'caveat'
  | 'counterpoint' | 'coverage' | 'relaxation';

export interface Fact {
  readonly label: string;
  /** Rendered numeric literal, already unit-converted. Empty for qualitative facts. */
  readonly display: string;
  readonly numeric: number | null;
  readonly unit: string | null;
  readonly capability: CapabilityKey | null;
  readonly claimIds: readonly string[];
}

export interface PlanNode {
  readonly id: PlanNodeId;
  readonly role: PlanNodeRole;
  readonly salience: number;
  readonly hedge: HedgeLevel;
  readonly facts: readonly Fact[];
  /** Deterministic fallback rendering. Always correct, never elegant. */
  readonly template: string;
}

export interface NarrativePlan {
  readonly id: string;
  readonly nodes: readonly PlanNode[];
  readonly hedgeFloor: HedgeLevel;
  readonly entityLabels: ReadonlyMap<string, string>;
  readonly omitted: readonly { readonly capability: CapabilityKey; readonly reason: 'low_salience' }[];
}
