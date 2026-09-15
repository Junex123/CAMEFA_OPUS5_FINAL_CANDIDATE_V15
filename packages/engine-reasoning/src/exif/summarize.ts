import { ok, err, type Result } from '@camefa/engine-kernel';
import { percentile, sortedNumbers, type ExifFrame } from './frame.js';

/** Below this, EXIF describes an afternoon, not a practice. Emit nothing. */
export const MIN_FRAMES_TOTAL = 250;
/** Per-facet gate: a facet with fewer contributing frames is omitted, not weakened. */
export const MIN_FRAMES_FACET = 60;

/** Frames within this gap belong to the same burst run. */
const BURST_GAP_MS = 600;
/** Frames separated by more than this start a new shooting session. */
const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

export type Facet<T> = { readonly value: T; readonly n: number };

export type ExifSummary = {
  readonly frames: number;
  readonly sessions: number;
  /** log2(iso / 100). Positive means above base. */
  readonly isoStopsP50: Facet<number> | null;
  readonly isoStopsP90: Facet<number> | null;
  /** 35mm-equivalent focal length. */
  readonly reachMmP50: Facet<number> | null;
  readonly reachMmP90: Facet<number> | null;
  readonly reachMmMax: Facet<number> | null;
  /** Fastest shutter in regular use: p10 of shutter seconds. */
  readonly shutterFastP10: Facet<number> | null;
  readonly apertureWideP10: Facet<number> | null;
  /** Fraction of frames simultaneously wide open and >= 3 stops over base. */
  readonly lightLimitedFraction: Facet<number> | null;
  /** p95 of consecutive-frame run length. */
  readonly burstRunP95: Facet<number> | null;
  readonly framesPerSessionP90: Facet<number> | null;
  readonly flashFraction: Facet<number> | null;
  /** Distinct bodies observed; >1 implies dual-body working style. */
  readonly distinctBodies: number;
  readonly distinctLenses: number;
};

export type ExifRejection = { readonly code: 'INSUFFICIENT_SAMPLE'; readonly frames: number };

const facet = <T>(value: T | null, n: number): Facet<T> | null =>
  value === null || n < MIN_FRAMES_FACET ? null : { value, n };

const isoToStops = (iso: number): number => Math.log2(iso / 100);

export const summarizeExif = (
  input: readonly ExifFrame[],
): Result<ExifSummary, ExifRejection> => {
  if (input.length < MIN_FRAMES_TOTAL) {
    return err({ code: 'INSUFFICIENT_SAMPLE', frames: input.length });
  }

  const frames = [...input].sort((a, b) => a.at - b.at);

  const isos = sortedNumbers(frames, (f) => f.iso);
  const isoStops = isos.map(isoToStops);

  // 35mm-equivalent. Frames lacking a crop factor are excluded rather than
  // assumed full-frame — assuming would systematically understate reach demand.
  const reach = sortedNumbers(frames, (f) =>
    f.focalLengthMm !== undefined && f.cropFactor !== undefined
      ? f.focalLengthMm * f.cropFactor
      : undefined,
  );

  const shutters = sortedNumbers(frames, (f) => f.shutterSeconds);
  const apertures = sortedNumbers(frames, (f) => f.apertureFNumber);

  const widest = apertures.length > 0 ? apertures[0]! : null;
  let lightLimited = 0;
  let lightLimitedEligible = 0;
  for (const f of frames) {
    if (f.apertureFNumber === undefined || f.iso === undefined) continue;
    lightLimitedEligible += 1;
    if (widest !== null && f.apertureFNumber <= widest * 1.06 && isoToStops(f.iso) >= 3) {
      lightLimited += 1;
    }
  }

  // Burst runs and session boundaries in one pass over the ordered stream.
  const runs: number[] = [];
  const perSession: number[] = [];
  let run = 1;
  let sessionCount = 1;
  let sessionFrames = 1;

  for (let i = 1; i < frames.length; i++) {
    const gap = frames[i]!.at - frames[i - 1]!.at;
    if (gap <= BURST_GAP_MS) {
      run += 1;
    } else {
      runs.push(run);
      run = 1;
    }
    if (gap > SESSION_GAP_MS) {
      perSession.push(sessionFrames);
      sessionFrames = 1;
      sessionCount += 1;
    } else {
      sessionFrames += 1;
    }
  }
  runs.push(run);
  perSession.push(sessionFrames);
  runs.sort((a, b) => a - b);
  perSession.sort((a, b) => a - b);

  const flashEligible = frames.filter((f) => f.flashFired !== undefined);
  const flashFired = flashEligible.filter((f) => f.flashFired === true).length;

  return ok({
    frames: frames.length,
    sessions: sessionCount,
    isoStopsP50: facet(percentile(isoStops, 50), isoStops.length),
    isoStopsP90: facet(percentile(isoStops, 90), isoStops.length),
    reachMmP50: facet(percentile(reach, 50), reach.length),
    reachMmP90: facet(percentile(reach, 90), reach.length),
    reachMmMax: facet(reach.length > 0 ? reach[reach.length - 1]! : null, reach.length),
    shutterFastP10: facet(percentile(shutters, 10), shutters.length),
    apertureWideP10: facet(percentile(apertures, 10), apertures.length),
    lightLimitedFraction: facet(
      lightLimitedEligible > 0 ? lightLimited / lightLimitedEligible : null,
      lightLimitedEligible,
    ),
    burstRunP95: facet(percentile(runs, 95), frames.length),
    framesPerSessionP90: facet(percentile(perSession, 90), frames.length),
    flashFraction: facet(
      flashEligible.length > 0 ? flashFired / flashEligible.length : null,
      flashEligible.length,
    ),
    distinctBodies: new Set(frames.map((f) => f.bodyKey).filter(Boolean)).size,
    distinctLenses: new Set(frames.map((f) => f.lensKey).filter(Boolean)).size,
  });
};
