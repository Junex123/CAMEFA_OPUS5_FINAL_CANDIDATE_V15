import { AGGREGATION_P } from '@camefa/engine-contracts';
import type { LeverageFinding } from '@camefa/engine-contracts';
import { powerMean, type Candidate, type Term } from './sensitivity.js';

const BISECT_ITERS = 40;

export interface ContestedSlot {
  conflictId: string;
  entityId: string;
  requirement: string;
  /** Normalised satisfaction implied by the lowest/highest competing claim. */
  valueLow: number;
  valueHigh: number;
  resolved: boolean;
}

export type { LeverageFinding } from '@camefa/engine-contracts';

function replace(c: Candidate, requirement: string, value: number): Candidate {
  return {
    ...c,
    terms: c.terms.map((t: Term) =>
      t.requirement === requirement ? { ...t, value } : t,
    ),
  };
}

function winnerId(cands: readonly Candidate[], p: number): string | null {
  let best: { id: string; s: number } | null = null;
  for (const c of cands) {
    if (c.eliminated) continue;
    const s = powerMean(c.terms, p);
    if (best === null || s > best.s || (s === best.s && c.entityId < best.id)) {
      best = { id: c.entityId, s };
    }
  }
  return best?.id ?? null;
}

/**
 * How far a single contested value must move before the recommendation
 * changes — the question a reviewer actually needs answered before spending
 * twelve minutes on a conflict.
 */
export function analyseLeverage(
  candidates: readonly Candidate[],
  contested: readonly ContestedSlot[],
  p = AGGREGATION_P,
): LeverageFinding[] {
  const base = winnerId(candidates, p);

  return contested.map((slot) => {
    const subject = candidates.find((c) => c.entityId === slot.entityId);
    const current =
      subject?.terms.find((t) => t.requirement === slot.requirement)?.value ?? null;
    const spread = Math.abs(slot.valueHigh - slot.valueLow);

    if (!subject || current === null || base === null) {
      return {
        conflictId: slot.conflictId,
        entityId: slot.entityId,
        requirement: slot.requirement,
        flipDelta: null,
        claimSpread: spread,
        decisive: false,
        resolved: slot.resolved,
      };
    }

    const swap = (value: number) =>
      candidates.map((c) => (c.entityId === slot.entityId ? replace(c, slot.requirement, value) : c));

    let flipDelta: number | null = null;
    for (const bound of [1, 0] as const) {
      if (winnerId(swap(bound), p) === base) continue;
      let lo = current;
      let hi = bound;
      for (let i = 0; i < BISECT_ITERS; i += 1) {
        const mid = (lo + hi) / 2;
        if (winnerId(swap(mid), p) === base) lo = mid;
        else hi = mid;
      }
      const d = Math.abs(hi - current);
      flipDelta = flipDelta === null ? d : Math.min(flipDelta, d);
    }

    return {
      conflictId: slot.conflictId,
      entityId: slot.entityId,
      requirement: slot.requirement,
      flipDelta,
      claimSpread: spread,
      decisive: flipDelta !== null && spread >= flipDelta,
      resolved: slot.resolved,
    };
  });
}
