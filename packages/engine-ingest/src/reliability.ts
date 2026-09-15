import { contentHash } from '@camefa/engine-kernel';

/**
 * ADR-058: reliability is computed at read time from an adjudication log, never
 * baked into stored claims. Recalibrating a source's trustworthiness must not
 * require re-ingesting years of data — and it must change past receipts'
 * conclusions only when the receipt is deliberately replayed.
 */
export const RELIABILITY_MODEL_VERSION = '1.0.0';

export type Adjudication = {
  readonly sourceId: string;
  /** Optional per-attribute scoping: a retailer may be reliable on price and useless on readout speed. */
  readonly attributeKey: string | null;
  readonly outcome: 'agreed' | 'disagreed';
  readonly at: string;
};

export type ReliabilityScore = {
  readonly sourceId: string;
  readonly attributeKey: string | null;
  /** Posterior mean of a Beta over agreement rate. */
  readonly mean: number;
  /** Lower bound of the 90% credible interval — what the engine actually uses. */
  readonly conservative: number;
  readonly effectiveN: number;
  readonly modelVersion: string;
};

/** Half-life in days. Specs change; a source that was accurate in 2019 is weak evidence now. */
const HALF_LIFE_DAYS = 540;
/** Beta(2, 2): a new source starts at 0.5 with real uncertainty, not at 1.0. */
const PRIOR_ALPHA = 2;
const PRIOR_BETA = 2;

const decay = (atMs: number, nowMs: number): number =>
  Math.pow(0.5, Math.max(0, nowMs - atMs) / (HALF_LIFE_DAYS * 86_400_000));

/** Normal approximation to the Beta lower bound; adequate above ~5 effective observations. */
const lowerBound = (alpha: number, beta: number): number => {
  const n = alpha + beta;
  const mean = alpha / n;
  const sd = Math.sqrt((mean * (1 - mean)) / (n + 1));
  return Math.max(0.02, Math.min(1, mean - 1.645 * sd));
};

export const scoreSource = (args: {
  sourceId: string;
  attributeKey: string | null;
  log: readonly Adjudication[];
  now: string;
}): ReliabilityScore => {
  const nowMs = Date.parse(args.now);
  let alpha = PRIOR_ALPHA;
  let beta = PRIOR_BETA;

  for (const a of args.log) {
    if (a.sourceId !== args.sourceId) continue;
    // Attribute-scoped queries fall back to the source-wide log at half weight,
    // so a source with no history on this attribute is neither trusted nor blind.
    const scoped = a.attributeKey === args.attributeKey;
    const relevant = scoped || a.attributeKey === null || args.attributeKey === null;
    if (!relevant) continue;

    const w = decay(Date.parse(a.at), nowMs) * (scoped ? 1 : 0.5);
    if (a.outcome === 'agreed') alpha += w;
    else beta += w;
  }

  return {
    sourceId: args.sourceId,
    attributeKey: args.attributeKey,
    mean: Number((alpha / (alpha + beta)).toFixed(4)),
    conservative: Number(lowerBound(alpha, beta).toFixed(4)),
    effectiveN: Number((alpha + beta - PRIOR_ALPHA - PRIOR_BETA).toFixed(2)),
    modelVersion: RELIABILITY_MODEL_VERSION,
  };
};

/** Goes into the version triplet so a recalibration is a replayable event. */
export const reliabilityFingerprint = (scores: readonly ReliabilityScore[]): string =>
  contentHash({ v: RELIABILITY_MODEL_VERSION, s: [...scores].sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1)) });
