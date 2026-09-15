export type ConsoleState =
  | { phase: 'streaming'; progress: ProgressState }
  | { phase: 'settled'; verified: VerificationResult; telemetry: Telemetry }
  | { phase: 'failed'; reason: string; telemetry: Telemetry };

/** Advisory only. Never rendered as part of the answer (ADR-067). */
interface ProgressState {
  readonly partialRanking: readonly RankedEntry[];
  readonly partialEliminations: readonly EliminatedCandidate[];
  readonly coverage?: CoverageReport;
  readonly fragilityProgress?: { completed: number; total: number };
  readonly telemetry: Telemetry;
}

export function reduce(state: ConsoleState, event: StreamEvent): ConsoleState {
  if (state.phase !== 'streaming') return state;

  switch (event.type) {
    case 'sealed': {
      // Hard discontinuity: accumulated decision state is discarded entirely.
      // Only timing/cost telemetry survives, and it is labelled unverified.
      const verified = verifyReceipt(event.receipt);
      return { phase: 'settled', verified, telemetry: state.progress.telemetry };
    }
    case 'ranked':
      return streaming(state, { partialRanking: [...state.progress.partialRanking, event.entry] });
    case 'eliminated':
      return streaming(state, {
        partialEliminations: [...state.progress.partialEliminations, event.candidate],
      });
    case 'coverage':
      return streaming(state, { coverage: event.coverage });
    case 'fragility_progress':
      return streaming(state, {
        fragilityProgress: { completed: event.completed, total: event.total },
      });
    case 'heartbeat':
      return streaming(state, { telemetry: tick(state.progress.telemetry, event) });
    case 'error':
      return { phase: 'failed', reason: event.message, telemetry: state.progress.telemetry };
  }
}
