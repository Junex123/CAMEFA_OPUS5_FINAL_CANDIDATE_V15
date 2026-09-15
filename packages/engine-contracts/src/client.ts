import type { DecisionReceipt } from './receipt.js';
import type { StreamEvent } from './stream.js';
import type { CostAllowance } from './cost.js';
import type { NormalizedRequest } from './request.js';

export type DecisionRequest = NormalizedRequest;
export type EvaluateRequest = DecisionRequest;
export type Operation = 'evaluate' | 'solve' | 'interpret';
export type CostEstimate = CostAllowance;

export interface DecisionEngineClient {
  evaluate(request: DecisionRequest): Promise<DecisionReceipt>;
  evaluateStream(request: DecisionRequest): AsyncIterable<StreamEvent>;
}

export const estimateCost = (operation: Operation, breadth: number): CostEstimate => {
  const scale = breadth <= 0 ? 1 : Math.max(1, Math.log2(breadth + 1) / 4);
  const base: Record<Operation, CostEstimate> = {
    evaluate: { evidenceReads: 600, derivations: 400, scoringPasses: 2000, wallClockMs: 2000 },
    solve: { evidenceReads: 1200, derivations: 800, scoringPasses: 20000, wallClockMs: 8000 },
    interpret: { evidenceReads: 200, derivations: 100, scoringPasses: 0, wallClockMs: 1500 },
  };
  const b = base[operation];
  return {
    evidenceReads: Math.ceil(b.evidenceReads * scale),
    derivations: Math.ceil(b.derivations * scale),
    scoringPasses: Math.ceil(b.scoringPasses * scale),
    wallClockMs: Math.ceil(b.wallClockMs * scale),
  };
};

/** Backward-compatible stateless facade used by early callers. */
export const EngineClient = {
  estimate(operation: Operation, req: EvaluateRequest): CostEstimate {
    return estimateCost(operation, req.candidates.length);
  },
};

