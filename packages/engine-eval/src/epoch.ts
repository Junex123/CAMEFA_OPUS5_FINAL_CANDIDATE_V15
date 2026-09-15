import type { ReplayRun } from './replay.js';

export interface EpochBinding {
  corpusEpoch: string;
  baselineEpoch: string | null;
}

/**
 * Swapping synthetic seeds for real evidence changes every claim in the
 * corpus. Diffing across that boundary produces a wall of "attributable to
 * claimSetHash" churn that is real but uninformative — the baselines describe
 * a world that no longer exists. The gate must refuse the comparison and
 * demand re-baselining rather than report a hundred false regressions.
 */
export function epochGuard(
  run: ReplayRun,
  binding: EpochBinding,
): { comparable: boolean; reason: string | null } {
  if (binding.baselineEpoch === null) {
    return { comparable: false, reason: 'baselines carry no corpus epoch; re-baseline required' };
  }
  if (binding.baselineEpoch !== binding.corpusEpoch) {
    return {
      comparable: false,
      reason: `baselines were sealed under corpus epoch ${binding.baselineEpoch}, candidate runs under ${binding.corpusEpoch}`,
    };
  }
  return { comparable: true, reason: null };
}
