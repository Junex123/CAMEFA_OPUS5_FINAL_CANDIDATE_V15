import type { Selection } from './anchor-plan.js';

export interface AnchorOutcome {
  slotKey: string;
  stratum: string;
  selection: Selection;
  absError: number;
  signedError: number;
  jnd: number;
  surprising: boolean;
}

export interface StratumSurprise {
  stratum: string;
  n: number;
  surprises: number;
  surpriseRate: number;
  meanAbsError: number;
  meanSignedError: number;
  /** Errors point consistently one way — a systematic offset, not noise. */
  biased: boolean;
}

export interface BlindSpotReport {
  byStratum: StratumSurprise[];
  targetedSurpriseRate: number;
  exploratorySurpriseRate: number;
  targetedN: number;
  exploratoryN: number;
  /** Exploration finds more errors than targeting: targeting is looking in the wrong place. */
  blindSpot: boolean;
  underPowered: boolean;
  narrative: string;
}

const MIN_N = 12;
const BIAS_RATIO = 0.6;
const BLIND_SPOT_MARGIN = 1.5;

function summarise(stratum: string, rows: AnchorOutcome[]): StratumSurprise {
  const n = rows.length;
  const surprises = rows.filter((r) => r.surprising).length;
  const meanAbs = n === 0 ? 0 : rows.reduce((s, r) => s + r.absError, 0) / n;
  const meanSigned = n === 0 ? 0 : rows.reduce((s, r) => s + r.signedError, 0) / n;
  return {
    stratum,
    n,
    surprises,
    surpriseRate: n === 0 ? 0 : surprises / n,
    meanAbsError: meanAbs,
    meanSignedError: meanSigned,
    biased: n >= MIN_N && meanAbs > 0 && Math.abs(meanSigned) / meanAbs > BIAS_RATIO,
  };
}

export function assessBlindSpots(
  outcomes: readonly AnchorOutcome[],
): BlindSpotReport {
  const strata = [...new Set(outcomes.map((o) => o.stratum))].sort();
  const byStratum = strata.map((s) =>
    summarise(
      s,
      outcomes.filter((o) => o.stratum === s),
    ),
  );

  const targeted = outcomes.filter((o) => o.selection === 'targeted');
  const exploratory = outcomes.filter((o) => o.selection === 'exploratory');
  const tRate = targeted.length === 0 ? 0 : targeted.filter((o) => o.surprising).length / targeted.length;
  const eRate = exploratory.length === 0 ? 0 : exploratory.filter((o) => o.surprising).length / exploratory.length;

  const underPowered = targeted.length < MIN_N || exploratory.length < MIN_N;
  const blindSpot = !underPowered && eRate > tRate * BLIND_SPOT_MARGIN && eRate > 0.1;

  const biasedStrata = byStratum.filter((s) => s.biased).map((s) => s.stratum);

  let narrative: string;
  if (underPowered) {
    narrative = `Too few measurements to compare arms (${targeted.length} targeted, ${exploratory.length} exploratory; need ${MIN_N} each).`;
  } else if (blindSpot) {
    narrative =
      `Blind samples disagree with the engine ${(eRate * 100).toFixed(0)}% of the time versus ` +
      `${(tRate * 100).toFixed(0)}% for targeted ones. Targeting is concentrating effort where the engine already knows it is unsure, ` +
      'while the errors live where it is confident. Raise the exploration fraction until the rates converge.';
  } else {
    narrative =
      `Targeted ${(tRate * 100).toFixed(0)}% vs blind ${(eRate * 100).toFixed(0)}% surprise rate — ` +
      'no evidence that targeting is missing a region of the corpus.';
  }
  if (biasedStrata.length > 0) {
    narrative += ` Systematic offset detected in: ${biasedStrata.join(', ')} — check the parser or unit conversion before adjudicating individual slots.`;
  }

  return {
    byStratum,
    targetedSurpriseRate: tRate,
    exploratorySurpriseRate: eRate,
    targetedN: targeted.length,
    exploratoryN: exploratory.length,
    blindSpot,
    underPowered,
    narrative,
  };
}
