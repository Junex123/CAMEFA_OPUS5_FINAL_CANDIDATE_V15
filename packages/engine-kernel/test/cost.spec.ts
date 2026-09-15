import { describe, expect, it } from 'vitest';
import { addCost, BudgetExceeded, BudgetExhaustedError, CostMeter } from '../src/cost.js';

describe('CostMeter', () => {
  it('accumulates per dimension', () => {
    const m = new CostMeter();
    m.charge('scoringPasses', 10);
    m.charge('scoringPasses', 5);
    m.charge('derivations', 2);
    expect(m.snapshot()).toEqual({ derivations: 2, scoringPasses: 15 });
  });

  it('aborts rather than degrading when a budget is exhausted', () => {
    const m = new CostMeter({
      evidenceReads: Number.POSITIVE_INFINITY,
      derivations: Number.POSITIVE_INFINITY,
      scoringPasses: 10,
      wallClockMs: Number.POSITIVE_INFINITY,
      fragility: { evidenceReads: 0, derivations: 0, scoringPasses: 0, wallClockMs: 0 },
    });
    m.charge('scoringPasses', 9);
    expect(() => m.charge('scoringPasses', 2)).toThrow(BudgetExhaustedError);
    expect(BudgetExceeded).toBe(BudgetExhaustedError);
  });

  it('reports the offending dimension', () => {
    const m = new CostMeter({
      evidenceReads: 1,
      derivations: Number.POSITIVE_INFINITY,
      scoringPasses: Number.POSITIVE_INFINITY,
      wallClockMs: Number.POSITIVE_INFINITY,
      fragility: { evidenceReads: 0, derivations: 0, scoringPasses: 0, wallClockMs: 0 },
    });
    try {
      m.charge('evidenceReads', 4);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BudgetExhaustedError);
      expect(e).toMatchObject({ dimension: 'evidenceReads', limit: 1 });
    }
  });

  it('rejects invalid amounts and ignores zero', () => {
    const m = new CostMeter();
    m.charge('wallClockMs', 0);
    expect(() => m.charge('wallClockMs', -1)).toThrow(TypeError);
    expect(() => m.charge('wallClockMs', Number.NaN)).toThrow(TypeError);
  });

  it('supports an isolated, soft-failing fragility scope', () => {
    const m = new CostMeter({
      evidenceReads: Number.POSITIVE_INFINITY,
      derivations: Number.POSITIVE_INFINITY,
      scoringPasses: Number.POSITIVE_INFINITY,
      wallClockMs: Number.POSITIVE_INFINITY,
      fragility: { evidenceReads: 0, derivations: 0, scoringPasses: 1, wallClockMs: 0 },
    });
    expect(m.fragility.tryCharge('scoringPasses', 1)).toBe(true);
    expect(m.fragility.tryCharge('scoringPasses', 1)).toBe(false);
    expect(m.fragility.exhausted).toBe(true);
    expect(m.report().fragility.exhausted).toBe(true);
  });
});

describe('addCost', () => {
  it('sums vectors and drops zeroes', () => {
    expect(addCost({ wallClockMs: 3 }, { wallClockMs: 4, scoringPasses: 0 }))
      .toEqual({ wallClockMs: 7 });
  });
});
