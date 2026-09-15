import type { DecisionReceipt } from './receipt.js';
import type { CoverageReport, EliminatedCandidate, RankedCandidate } from './decision-payload.js';

export type StreamEvent =
  | { readonly type: 'coverage'; readonly coverage: CoverageReport }
  | { readonly type: 'eliminated'; readonly candidate: EliminatedCandidate }
  | { readonly type: 'ranked'; readonly entry: RankedCandidate }
  | { readonly type: 'fragility_progress'; readonly completed: number; readonly total: number }
  | { readonly type: 'heartbeat'; readonly timestamp?: string }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'sealed'; readonly receipt: DecisionReceipt };
