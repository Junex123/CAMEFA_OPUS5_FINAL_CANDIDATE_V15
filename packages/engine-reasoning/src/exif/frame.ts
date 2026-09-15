/**
 * A single capture record. Deliberately narrow: GPS, filenames, and absolute
 * timestamps beyond ordering are NEVER accepted into the engine. EXIF is a
 * behavioural signal, not a location history.
 */
export type ExifFrame = {
  /** Monotonic ordering key only. Caller supplies epoch ms, already tz-normalized. */
  readonly at: number;
  readonly bodyKey?: string;
  readonly lensKey?: string;
  readonly focalLengthMm?: number;
  /** Sensor crop factor relative to 36x24. Required to normalize reach. */
  readonly cropFactor?: number;
  readonly apertureFNumber?: number;
  readonly iso?: number;
  readonly shutterSeconds?: number;
  readonly flashFired?: boolean;
};

/** Nearest-rank percentile. Deterministic, no interpolation, no float drift. */
export const percentile = (sorted: readonly number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? null;
};

export const sortedNumbers = (
  frames: readonly ExifFrame[],
  pick: (f: ExifFrame) => number | undefined,
): number[] => {
  const out: number[] = [];
  for (const f of frames) {
    const v = pick(f);
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.push(v);
  }
  return out.sort((a, b) => a - b);
};
