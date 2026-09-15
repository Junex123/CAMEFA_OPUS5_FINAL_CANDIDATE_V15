import type { CostDimension } from '@camefa/engine-kernel';
import { activeWaivers, type Waiver } from './golden.js';
import type { QuestionResult, ReplayRun } from './replay.js';

export interface GateThresholds {
  /** Fraction of compared questions whose top recommendation may flip. */
  maxWinnerFlipRate: number;
  /** p95 of Kendall τ distance across compared questions. */
  maxTauP95: number;
  maxEliminationFlipRate: number;
  /** Multiplier on baseline p95 cost, per dimension. */
  maxCostP95Ratio: number;
  minComparedFraction: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  maxWinnerFlipRate: 0.15,
  maxTauP95: 0.25,
  maxEliminationFlipRate: 0.05,
  maxCostP95Ratio: 1.4,
  minComparedFraction: 0.9,
};

export type Severity = 'blocking' | 'advisory';

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  questionKeys: string[];
}

export interface GateReport {
  verdict: 'pass' | 'pass_with_churn' | 'fail';
  findings: Finding[];
  metrics: {
    total: number;
    compared: number;
    comparedFraction: number;
    winnerFlips: number;
    winnerFlipRate: number;
    eliminationFlips: number;
    eliminationFlipRate: number;
    tauP95: number;
    tauMean: number;
    anchorFailures: number;
    editorialFailures: number;
    determinismViolations: number;
    engineErrors: number;
    costP95: Partial<Record<CostDimension, number>>;
  };
  waiversApplied: string[];
  staleWaivers: string[];
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank; deterministic and free of interpolation surprises.
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

const anchorFails = (r: QuestionResult) =>
  r.expectations.filter((e) => e.provenance === 'anchor' && !e.satisfied);

export function evaluateGate(
  run: ReplayRun,
  thresholds: GateThresholds = DEFAULT_THRESHOLDS,
  waivers: readonly Waiver[] = [],
  now: Date = new Date(),
): GateReport {
  const { active, stale } = activeWaivers(
    waivers,
    run.candidateEngine.calibrationRef ?? null,
    now,
  );
  const waived = new Set(active.map((w) => w.questionKey));

  const all = run.results;
  const compared = all.filter((r) => r.diff !== null);
  const churnable = compared.filter((r) => !waived.has(r.questionKey));

  const taus = churnable.map((r) => r.diff!.tau.normalized);
  const winnerFlips = churnable.filter((r) => r.diff!.winnerChanged);
  const elimFlips = churnable.filter(
    (r) => r.diff!.eliminationFlips.length > 0,
  );
  const determinism = compared.filter(
    (r) => r.diff!.attribution.kind === 'unattributable',
  );
  const incomparable = compared.filter(
    (r) => r.diff!.attribution.kind === 'incomparable',
  );
  const engineErrors = all.filter((r) => r.status === 'engine_error');
  const missingBaseline = all.filter((r) => r.status === 'baseline_missing');

  // Anchored expectation failures are never waivable: a waiver excuses churn,
  // not being wrong about a measured fact.
  const anchorFailing = all.filter((r) => anchorFails(r).length > 0);
  const editorialFailing = all.filter((r) =>
    r.expectations.some((e) => e.provenance === 'editorial' && !e.satisfied),
  );

  const denom = churnable.length || 1;
  const winnerFlipRate = winnerFlips.length / denom;
  const elimFlipRate = elimFlips.length / denom;
  const tauP95 = percentile(taus, 0.95);
  const comparedFraction = all.length === 0 ? 0 : compared.length / all.length;

  const dims = new Set<CostDimension>();
  for (const r of all) {
    for (const d of Object.keys(r.cost) as CostDimension[]) dims.add(d);
  }
  const costP95: Partial<Record<CostDimension, number>> = {};
  for (const d of dims) {
    costP95[d] = percentile(
      all.map((r) => r.cost[d] ?? 0),
      0.95,
    );
  }

  const findings: Finding[] = [];
  const add = (
    code: string,
    severity: Severity,
    message: string,
    rows: QuestionResult[],
  ) => {
    if (rows.length > 0 || severity === 'blocking') {
      findings.push({
        code,
        severity,
        message,
        questionKeys: rows.map((r) => r.questionKey),
      });
    }
  };

  if (engineErrors.length > 0) {
    add('engine_error', 'blocking', 'Candidate engine threw during replay.', engineErrors);
  }
  if (determinism.length > 0) {
    add(
      'determinism_violation',
      'blocking',
      'Outcome changed with no versioned dimension change (ADR-068). Either an input is unversioned or the engine is non-deterministic.',
      determinism,
    );
  }
  if (anchorFailing.length > 0) {
    add(
      'anchor_regression',
      'blocking',
      'Anchor-backed expectations failed. These trace to independent measurements and are not waivable.',
      anchorFailing,
    );
  }
  if (comparedFraction < thresholds.minComparedFraction) {
    add(
      'insufficient_coverage',
      'blocking',
      `Only ${(comparedFraction * 100).toFixed(1)}% of golden questions had a usable baseline (min ${(thresholds.minComparedFraction * 100).toFixed(0)}%). A gate that compares nothing passes everything.`,
      missingBaseline,
    );
  }
  if (winnerFlipRate > thresholds.maxWinnerFlipRate) {
    add(
      'winner_flip_budget',
      'blocking',
      `Top recommendation flipped on ${(winnerFlipRate * 100).toFixed(1)}% of questions (budget ${(thresholds.maxWinnerFlipRate * 100).toFixed(0)}%).`,
      winnerFlips,
    );
  }
  if (tauP95 > thresholds.maxTauP95) {
    add(
      'reordering_budget',
      'blocking',
      `τ p95 ${tauP95.toFixed(3)} exceeds ${thresholds.maxTauP95}.`,
      churnable.filter((r) => r.diff!.tau.normalized > thresholds.maxTauP95),
    );
  }
  if (elimFlipRate > thresholds.maxEliminationFlipRate) {
    add(
      'elimination_flip_budget',
      'blocking',
      `Hard-constraint verdicts flipped on ${(elimFlipRate * 100).toFixed(1)}% of questions (budget ${(thresholds.maxEliminationFlipRate * 100).toFixed(0)}%).`,
      elimFlips,
    );
  }

  if (editorialFailing.length > 0) {
    add(
      'editorial_disagreement',
      'advisory',
      'Editorial expectations failed. Advisory only — these encode judgement, not measurement (ADR-066).',
      editorialFailing,
    );
  }
  if (incomparable.length > 0) {
    add(
      'incomparable_baseline',
      'advisory',
      'Baseline answers a different question; refresh the golden entry.',
      incomparable,
    );
  }
  if (stale.length > 0) {
    findings.push({
      code: 'stale_waiver',
      severity: 'advisory',
      message:
        'Waivers ignored: expired or bound to a different calibration. Churn they once excused is now counted.',
      questionKeys: stale.map((w) => w.questionKey),
    });
  }
  if (winnerFlips.length > 0 && winnerFlipRate <= thresholds.maxWinnerFlipRate) {
    add(
      'winner_churn',
      'advisory',
      'Top recommendation changed within budget; review the linked diffs before shipping.',
      winnerFlips,
    );
  }

  const blocking = findings.some((f) => f.severity === 'blocking');
  const churny = findings.some((f) => f.severity === 'advisory');

  return {
    verdict: blocking ? 'fail' : churny ? 'pass_with_churn' : 'pass',
    findings,
    metrics: {
      total: all.length,
      compared: compared.length,
      comparedFraction,
      winnerFlips: winnerFlips.length,
      winnerFlipRate,
      eliminationFlips: elimFlips.length,
      eliminationFlipRate: elimFlipRate,
      tauP95,
      tauMean: taus.length === 0 ? 0 : taus.reduce((a, b) => a + b, 0) / taus.length,
      anchorFailures: anchorFailing.length,
      editorialFailures: editorialFailing.length,
      determinismViolations: determinism.length,
      engineErrors: engineErrors.length,
      costP95,
    },
    waiversApplied: [...waived],
    staleWaivers: stale.map((w) => w.questionKey),
  };
}
