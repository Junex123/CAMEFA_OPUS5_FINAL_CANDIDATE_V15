import { describe, expect, it } from 'vitest';
import { evaluateGate, percentile } from '../src/gate.js';
import type { QuestionResult, ReplayRun } from '../src/replay.js';

const engine = {
  ontologyFingerprint: 'ont:1',
  modelRef: 'mdl:1',
  calibrationRef: 'cal:2',
  reliabilityFingerprint: 'rel:1',
} as never;

const result = (over: Partial<QuestionResult>): QuestionResult => ({
  questionKey: over.questionKey ?? 'q:1',
  stratum: 'wedding',
  status: 'ok',
  candidateReceiptId: 'r:new',
  diff: {
    a: 'r:old',
    b: 'r:new',
    attribution: { kind: 'attributable', dimensions: ['calibrationRef'] },
    changed: ['calibrationRef'],
    versions: {} as never,
    rows: [],
    winnerChanged: false,
    winnerA: 'a',
    winnerB: 'a',
    tau: { discordant: 0, pairs: 3, normalized: 0 },
    eliminationFlips: [],
    maxScoreDelta: 0.01,
  },
  expectations: [],
  cost: { solverNodes: 100 },
  wallMs: 5,
  error: null,
  ...over,
});

const run = (results: QuestionResult[]): ReplayRun => ({
  setId: 'golden',
  goldenFingerprint: 'gs:1',
  candidateEngine: engine,
  startedAt: '2026-01-01T00:00:00.000Z',
  results,
});

describe('percentile', () => {
  it('uses nearest-rank without interpolation', () => {
    expect(percentile([0, 0, 0, 1], 0.95)).toBe(1);
    expect(percentile([0.1, 0.2, 0.3], 0.5)).toBe(0.2);
    expect(percentile([], 0.95)).toBe(0);
  });
});

describe('evaluateGate', () => {
  it('passes a clean run', () => {
    const g = evaluateGate(run([result({}), result({ questionKey: 'q:2' })]));
    expect(g.verdict).toBe('pass');
    expect(g.findings).toHaveLength(0);
  });

  it('blocks on anchor regressions regardless of churn budget', () => {
    const g = evaluateGate(
      run([
        result({
          expectations: [
            {
              expectationId: 'e1',
              provenance: 'anchor',
              satisfied: false,
              detail: 'measured 658 g, engine used 690 g',
            },
          ],
        }),
      ]),
    );
    expect(g.verdict).toBe('fail');
    expect(g.findings.map((f) => f.code)).toContain('anchor_regression');
  });

  it('treats editorial disagreement as advisory only', () => {
    const g = evaluateGate(
      run([
        result({
          expectations: [
            {
              expectationId: 'e2',
              provenance: 'editorial',
              satisfied: false,
              detail: 'reviewer prefers the other body',
            },
          ],
        }),
      ]),
    );
    expect(g.verdict).toBe('pass_with_churn');
    expect(
      g.findings.find((f) => f.code === 'editorial_disagreement')?.severity,
    ).toBe('advisory');
  });

  it('blocks when a determinism violation appears', () => {
    const r = result({});
    r.diff!.attribution = { kind: 'unattributable', reason: 'determinism_violation' };
    expect(evaluateGate(run([r])).verdict).toBe('fail');
  });

  it('blocks when too few questions had a baseline', () => {
    const g = evaluateGate(
      run([
        result({}),
        result({ questionKey: 'q:2', status: 'baseline_missing', diff: null }),
      ]),
    );
    expect(g.findings.map((f) => f.code)).toContain('insufficient_coverage');
  });

  it('excludes waived questions from the churn budget', () => {
    const flip = (key: string) => {
      const r = result({ questionKey: key });
      r.diff!.winnerChanged = true;
      r.diff!.tau.normalized = 0.9;
      return r;
    };
    const results = [flip('q:1'), ...Array.from({ length: 9 }, (_, i) => result({ questionKey: `q:${i + 2}` }))];
    const waiver = {
      questionKey: 'q:1',
      reason: 'intentional: reach weighting raised for wildlife',
      boundToCalibrationRef: 'cal:2',
      expiresAt: '2026-12-31T00:00:00.000Z',
      approvedBy: 'ops',
    };
    const g = evaluateGate(run(results), undefined, [waiver], new Date('2026-06-01'));
    expect(g.metrics.winnerFlips).toBe(0);
    expect(g.verdict).toBe('pass');
  });

  it('ignores waivers bound to a different calibration and says so', () => {
    const r = result({});
    r.diff!.winnerChanged = true;
    const waiver = {
      questionKey: 'q:1',
      reason: 'old change',
      boundToCalibrationRef: 'cal:1',
      expiresAt: '2026-12-31T00:00:00.000Z',
      approvedBy: 'ops',
    };
    const g = evaluateGate(run([r]), undefined, [waiver], new Date('2026-06-01'));
    expect(g.staleWaivers).toEqual(['q:1']);
    expect(g.metrics.winnerFlips).toBe(1);
  });

  it('blocks when winner flips exceed the budget', () => {
    const results = Array.from({ length: 10 }, (_, i) => {
      const r = result({ questionKey: `q:${i}` });
      if (i < 3) r.diff!.winnerChanged = true;
      return r;
    });
    const g = evaluateGate(run(results));
    expect(g.metrics.winnerFlipRate).toBeCloseTo(0.3);
    expect(g.findings.map((f) => f.code)).toContain('winner_flip_budget');
  });
});
