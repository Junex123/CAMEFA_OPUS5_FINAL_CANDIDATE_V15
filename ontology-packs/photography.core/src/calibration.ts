/**
 * ADR-034: emphasis is ordinal. Users reliably rank importance; they do not
 * reliably produce cardinal weights. The ordinal->weight map is a single
 * versioned table so it is diffable, replayable, and recalibratable from
 * telemetry without touching engine code.
 */
export const CALIBRATION_ID = 'photography.core/emphasis';
export const CALIBRATION_VERSION = '0.1.0';

export type EmphasisLevel = 'critical' | 'high' | 'moderate' | 'low' | 'ignore';

/**
 * Roughly geometric with ratio ~0.6. Rationale: adjacent ordinal steps are
 * perceived as "clearly more important", which empirical preference-elicitation
 * literature places near a 1.5–1.8x cardinal ratio, not the 1.25x a linear
 * 5-point scale would impose.
 *
 * PROVENANCE: prior, not measured. Every decision receipt carries
 * calibrationFingerprint so historical rankings remain replayable after
 * these numbers are refit against real choice data.
 */
export const EMPHASIS_WEIGHTS: Readonly<Record<EmphasisLevel, number>> = Object.freeze({
  critical: 1.0,
  high: 0.6,
  moderate: 0.36,
  low: 0.15,
  ignore: 0,
});

export const EMPHASIS_PROVENANCE = 'prior' as const;

/**
 * Non-compensatory floor (ADR-027). A `critical` requirement scoring near zero
 * must drag the aggregate down even if everything else is perfect, so critical
 * requirements are additionally routed through the hard-gate path when the
 * candidate's *upper* interval bound falls below this satisfaction level.
 */
export const CRITICAL_GATE_FLOOR = 0.2;

/** Aggregation exponent per ADR-027; p <= 0 yields geometric-or-harsher means. */
export const AGGREGATION_P = -0.5;

export const emphasisWeight = (level: EmphasisLevel): number => EMPHASIS_WEIGHTS[level];

export const calibrationRef = () => ({
  id: CALIBRATION_ID,
  version: CALIBRATION_VERSION,
  provenance: EMPHASIS_PROVENANCE,
  weights: EMPHASIS_WEIGHTS,
  p: AGGREGATION_P,
  criticalGateFloor: CRITICAL_GATE_FLOOR,
});
