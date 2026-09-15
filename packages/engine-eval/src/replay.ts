import {
  diffReceipts,
  type DecisionReceipt,
  type ReceiptDiff,
} from '@camefa/engine-contracts';
import type { CostDimension } from '@camefa/engine-kernel';
import { checkExpectations, type ExpectationResult } from './expectation.js';
import type { GoldenQuestion, GoldenSet } from './golden.js';

export interface ReplayEngine {
  version: DecisionReceipt['engine'];
  evaluate(
    request: unknown,
    hooks: { onCost(dim: CostDimension, delta: number): void },
  ): Promise<{ receipt: DecisionReceipt }>;
}

export interface BaselineStore {
  byId(receiptId: string): Promise<DecisionReceipt | null>;
}

export interface QuestionResult {
  questionKey: string;
  stratum: string;
  status: 'ok' | 'no_baseline' | 'baseline_missing' | 'engine_error';
  candidateReceiptId: string | null;
  diff: ReceiptDiff | null;
  expectations: ExpectationResult[];
  cost: Partial<Record<CostDimension, number>>;
  wallMs: number;
  error: string | null;
}

export interface ReplayRun {
  setId: string;
  goldenFingerprint: string;
  candidateEngine: DecisionReceipt['engine'];
  startedAt: string;
  results: QuestionResult[];
}

async function one(
  q: GoldenQuestion,
  engine: ReplayEngine,
  baselines: BaselineStore,
): Promise<QuestionResult> {
  const cost: Partial<Record<CostDimension, number>> = {};
  const t0 = Date.now();

  let receipt: DecisionReceipt;
  try {
    const out = await engine.evaluate(q.request, {
      onCost: (dim, delta) => {
        cost[dim] = (cost[dim] ?? 0) + delta;
      },
    });
    receipt = out.receipt;
  } catch (err) {
    return {
      questionKey: q.questionKey,
      stratum: q.stratum,
      status: 'engine_error',
      candidateReceiptId: null,
      diff: null,
      expectations: [],
      cost,
      wallMs: Date.now() - t0,
      error: (err as Error).message,
    };
  }

  const expectations = checkExpectations(receipt, q.expectations);
  const base = q.baselineReceiptId
    ? await baselines.byId(q.baselineReceiptId)
    : null;

  return {
    questionKey: q.questionKey,
    stratum: q.stratum,
    status: !q.baselineReceiptId
      ? 'no_baseline'
      : base
        ? 'ok'
        : 'baseline_missing',
    candidateReceiptId: receipt.receiptId,
    diff: base ? diffReceipts(base, receipt) : null,
    expectations,
    cost,
    wallMs: Date.now() - t0,
    error: null,
  };
}

export async function replayGoldenSet(
  set: GoldenSet,
  engine: ReplayEngine,
  baselines: BaselineStore,
  concurrency = 4,
): Promise<ReplayRun> {
  const results: QuestionResult[] = new Array(set.questions.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < set.questions.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await one(set.questions[i], engine, baselines);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, set.questions.length) }, worker),
  );

  return {
    setId: set.setId,
    goldenFingerprint: set.fingerprint,
    candidateEngine: engine.version,
    startedAt: new Date().toISOString(),
    results,
  };
}
