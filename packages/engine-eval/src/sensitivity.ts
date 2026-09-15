import { AGGREGATION_P, weightedPowerMean } from '@camefa/engine-contracts';
import type { SensitivityReport as ContractSensitivityReport } from '@camefa/engine-contracts';

const EPS = 1e-9;
/** Widest multiplier explored per weight. Beyond this the profile is a different profile. */
export const MAX_LAMBDA = 8;
/** Fixed iteration count keeps bisection bit-for-bit reproducible. */
const BISECT_ITERS = 40;

export interface Term {
  requirement: string;
  weight: number;
  /** Normalised satisfaction in [0,1]. */
  value: number;
}

export interface Candidate {
  entityId: string;
  label: string;
  eliminated: boolean;
  terms: Term[];
}

export function powerMean(terms: readonly Term[], p = AGGREGATION_P): number {
  return weightedPowerMean(terms, p);
}

function scoreWith(
  c: Candidate,
  requirement: string | null,
  lambda: number,
  p: number,
): number {
  if (c.eliminated) return -1;
  const terms =
    requirement === null
      ? c.terms
      : c.terms.map((t) =>
          t.requirement === requirement ? { ...t, weight: t.weight * lambda } : t,
        );
  return powerMean(terms, p);
}

/** Deterministic argmax: ties break on entityId so replays agree. */
function winnerUnder(
  candidates: readonly Candidate[],
  requirement: string | null,
  lambda: number,
  p: number,
): { entityId: string; score: number } | null {
  let best: { entityId: string; score: number } | null = null;
  for (const c of candidates) {
    if (c.eliminated) continue;
    const score = scoreWith(c, requirement, lambda, p);
    if (
      best === null ||
      score > best.score + EPS ||
      (Math.abs(score - best.score) <= EPS && c.entityId < best.entityId)
    ) {
      best = { entityId: c.entityId, score };
    }
  }
  return best;
}

export interface FlipPoint {
  /** Multiplier applied to the requirement's weight at the flip. */
  lambda: number;
  /** |ln λ| — direction-free magnitude, comparable across requirements. */
  logDistance: number;
  direction: 'up' | 'down';
  challengerId: string;
}

export interface TornadoEntry {
  requirement: string;
  weight: number;
  /** Winner's satisfaction of this requirement. */
  winnerValue: number;
  nearest: FlipPoint | null;
}

export type SensitivityReport = ContractSensitivityReport;

function bisect(
  candidates: readonly Candidate[],
  requirement: string,
  baseWinner: string,
  bound: number,
  p: number,
): FlipPoint | null {
  if (winnerUnder(candidates, requirement, bound, p)?.entityId === baseWinner) {
    return null;
  }
  let lo = 0; // ln(1)
  let hi = Math.log(bound);
  for (let i = 0; i < BISECT_ITERS; i += 1) {
    const mid = (lo + hi) / 2;
    const w = winnerUnder(candidates, requirement, Math.exp(mid), p)?.entityId;
    if (w === baseWinner) lo = mid;
    else hi = mid;
  }
  const lambda = Math.exp(hi);
  return {
    lambda,
    logDistance: Math.abs(hi),
    direction: bound > 1 ? 'up' : 'down',
    challengerId:
      winnerUnder(candidates, requirement, lambda, p)?.entityId ?? baseWinner,
  };
}

export function analyseSensitivity(
  candidates: readonly Candidate[],
  p = AGGREGATION_P,
): SensitivityReport {
  const live = candidates.filter((c) => !c.eliminated);
  const base = winnerUnder(live, null, 1, p);

  if (!base) {
    return {
      winnerId: null,
      runnerUpId: null,
      margin: 0,
      tornado: [],
      decidedBy: null,
      minLogDistance: null,
      fragility: 'undetermined',
      inertRequirements: [],
    };
  }

  const scored = live
    .map((c) => ({ entityId: c.entityId, score: scoreWith(c, null, 1, p) }))
    .sort((a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId));
  const runnerUp = scored[1] ?? null;

  const requirements = [
    ...new Set(live.flatMap((c) => c.terms.map((t) => t.requirement))),
  ].sort();
  const winner = live.find((c) => c.entityId === base.entityId)!;

  const tornado: TornadoEntry[] = requirements.map((requirement) => {
    const up = bisect(live, requirement, base.entityId, MAX_LAMBDA, p);
    const down = bisect(live, requirement, base.entityId, 1 / MAX_LAMBDA, p);
    const nearest =
      up && down ? (up.logDistance <= down.logDistance ? up : down) : (up ?? down);
    return {
      requirement,
      weight: winner.terms.find((t) => t.requirement === requirement)?.weight ?? 0,
      winnerValue:
        winner.terms.find((t) => t.requirement === requirement)?.value ?? 0,
      nearest,
    };
  });

  tornado.sort((a, b) => {
    const da = a.nearest?.logDistance ?? Number.POSITIVE_INFINITY;
    const db = b.nearest?.logDistance ?? Number.POSITIVE_INFINITY;
    return da - db || a.requirement.localeCompare(b.requirement);
  });

  const nearestOverall = tornado.find((t) => t.nearest !== null) ?? null;
  const minLogDistance = nearestOverall?.nearest?.logDistance ?? null;

  // Bands are in weight-multiplier terms: ×1.25 is inside normal calibration
  // drift, ×2 is a deliberate re-weighting decision.
  const fragility: SensitivityReport['fragility'] =
    minLogDistance === null
      ? 'robust'
      : minLogDistance < Math.log(1.25)
        ? 'knife_edge'
        : minLogDistance < Math.log(2)
          ? 'sensitive'
          : 'robust';

  return {
    winnerId: base.entityId,
    runnerUpId: runnerUp?.entityId ?? null,
    margin: runnerUp ? base.score - runnerUp.score : base.score,
    tornado,
    decidedBy: nearestOverall?.requirement ?? null,
    minLogDistance,
    fragility,
    inertRequirements: tornado
      .filter((t) => t.nearest === null)
      .map((t) => t.requirement),
  };
}

