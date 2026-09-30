import { AGGREGATION_P } from '@camefa/engine-contracts';

/** Canonical reasoning parameters that affect decision semantics and receipt identity. */
export interface ReasoningConfig {
  readonly aggregationP: number;
  readonly satisfactionFloor: number;
  readonly uncertaintySlack: number;
  readonly logisticSteepness: number;
  readonly logisticMidpointJnd: number;
  readonly defaultEntityType: string;
}

export const DEFAULT_REASONING: ReasoningConfig = {
  aggregationP: AGGREGATION_P,
  satisfactionFloor: 0.02,
  uncertaintySlack: 0.5,
  logisticSteepness: 0.9,
  logisticMidpointJnd: -1,
  defaultEntityType: 'gear.capture.body',
};

/** No imputation is currently applied to missing claims. Unknown stays unknown. */
export interface ImputationPolicy {
  readonly mode: 'none';
}

export const DEFAULT_IMPUTATION: ImputationPolicy = { mode: 'none' };
