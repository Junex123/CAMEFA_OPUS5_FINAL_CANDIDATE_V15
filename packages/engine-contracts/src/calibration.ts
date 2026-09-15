/**
 * Ordinal emphasis mapped to cardinal weights (Session 020). Users express
 * priority in words; the engine needs numbers. The gaps widen deliberately at
 * the top so "critical" dominates rather than merely leads.
 */
export const EMPHASIS_WEIGHTS = {
  irrelevant: 0,
  nice_to_have: 0.5,
  wanted: 1,
  important: 2,
  critical: 4,
} as const;

export type Emphasis = keyof typeof EMPHASIS_WEIGHTS;

export const EMPHASIS_ORDER: readonly Emphasis[] = [
  'irrelevant',
  'nice_to_have',
  'wanted',
  'important',
  'critical',
];

/**
 * Aggregation exponent for the weighted power mean (ADR-047). Negative, so
 * aggregation is non-compensatory: a single badly-unmet requirement drags the
 * total down and cannot be offset by surplus elsewhere. p = -0.5 was chosen so
 * a term at 0.2 satisfaction costs roughly as much as three terms at 0.8 gain.
 */
export const AGGREGATION_P = -0.5;

export interface CalibrationRef {
  calibrationId: string;
  /** Content address of the full calibration document. */
  fingerprint: string;
  emphasisWeightsHash: string;
  aggregationP: number;
  adoptedAt: string;
}

export function emphasisWeight(emphasis: Emphasis): number {
  return EMPHASIS_WEIGHTS[emphasis];
}
export interface WeightedTerm { weight:number; value:number; }
export function weightedPowerMean(terms: readonly WeightedTerm[], p:number=AGGREGATION_P):number {
  const total=terms.reduce((s,t)=>s+t.weight,0); if(total<=1e-9)return 0; let acc=0;
  for(const t of terms){ if(t.weight<=1e-9)continue; if(t.value<=1e-9)return 0; acc+=(t.weight/total)*t.value**p; }
  return acc<=1e-9?0:acc**(1/p);
}
