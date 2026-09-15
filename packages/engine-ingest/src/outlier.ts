/**
 * ADR-057: outliers are flagged with reduced confidence, never dropped. The
 * genuinely novel product looks exactly like a parse error until a second
 * source confirms it, and dropping it means the engine can never learn about
 * a real step change in the market.
 */
export type OutlierVerdict = {
  readonly isOutlier: boolean;
  /** Modified z-score (Iglewicz–Hoaglin). Robust to the outlier itself. */
  readonly modifiedZ: number | null;
  readonly cohortSize: number;
  /** Multiplier applied to the claim's confidence. 1 when not an outlier. */
  readonly confidenceFactor: number;
  readonly note: string | null;
};

const MIN_COHORT = 8;
const Z_THRESHOLD = 3.5;
const Z_EXTREME = 8;

const median = (sorted: readonly number[]): number => {
  const n = sorted.length;
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const detectOutlier = (
  value: number,
  cohort: readonly number[],
  opts: { readonly log?: boolean } = {},
): OutlierVerdict => {
  // Compare in the scale the attribute actually lives in. ISO and buffer depth
  // are log-distributed; treating them linearly flags every flagship.
  const xf = (v: number) => (opts.log ? Math.log2(Math.max(v, 1e-9)) : v);

  const peers = cohort.filter((v) => Number.isFinite(v)).map(xf).sort((a, b) => a - b);
  if (peers.length < MIN_COHORT) {
    return { isOutlier: false, modifiedZ: null, cohortSize: peers.length, confidenceFactor: 1, note: 'cohort too small to judge' };
  }

  const med = median(peers);
  const mad = median(peers.map((v) => Math.abs(v - med)).sort((a, b) => a - b));

  // A zero MAD means the cohort is near-constant; any deviation is suspicious,
  // but scale by the mean absolute deviation instead of dividing by zero.
  const denom = mad > 0
    ? 1.4826 * mad
    : (peers.reduce((s, v) => s + Math.abs(v - med), 0) / peers.length) * 1.2533;

  if (denom === 0) {
    const differs = xf(value) !== med;
    return {
      isOutlier: differs,
      modifiedZ: differs ? Infinity : 0,
      cohortSize: peers.length,
      confidenceFactor: differs ? 0.5 : 1,
      note: differs ? 'cohort is constant; value deviates' : null,
    };
  }

  const z = Math.abs(xf(value) - med) / denom;
  if (z < Z_THRESHOLD) {
    return { isOutlier: false, modifiedZ: z, cohortSize: peers.length, confidenceFactor: 1, note: null };
  }

  // Graduated penalty: mildly odd values stay usable, absurd ones nearly mute
  // themselves but remain visible in the ledger and in conflict reporting.
  const factor = z >= Z_EXTREME ? 0.15 : 0.6 - 0.1 * ((z - Z_THRESHOLD) / (Z_EXTREME - Z_THRESHOLD));

  return {
    isOutlier: true,
    modifiedZ: z,
    cohortSize: peers.length,
    confidenceFactor: Number(factor.toFixed(3)),
    note: `value is ${z.toFixed(1)} robust deviations from cohort median (n=${peers.length})`,
  };
};
