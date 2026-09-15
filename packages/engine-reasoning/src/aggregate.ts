/** Below this, a single dimension cannot annihilate the whole score. */
const SATISFACTION_FLOOR = 0.02;

export interface AggregationPart {
  readonly satisfaction: number;
  readonly weight: number;
}

/**
 * Weighted power mean. p = 0 is geometric, p < 0 more strongly non-compensatory,
 * p = 1 arithmetic. Default p = 0: a weak link drags the total down, which is how
 * people actually reject gear.
 */
export const aggregate = (parts: readonly AggregationPart[], p = 0): number => {
  const usable = parts.filter((x) => x.weight > 0);
  if (usable.length === 0) return 0.5;

  const total = usable.reduce((sum, x) => sum + x.weight, 0);
  if (total <= 0) return 0.5;

  const w = usable.map((x) => x.weight / total);
  const s = usable.map((x) => Math.max(x.satisfaction, SATISFACTION_FLOOR));

  if (p === 0) {
    return Math.exp(s.reduce((acc, si, i) => acc + w[i]! * Math.log(si), 0));
  }
  return Math.pow(s.reduce((acc, si, i) => acc + w[i]! * Math.pow(si, p), 0), 1 / p);
};
