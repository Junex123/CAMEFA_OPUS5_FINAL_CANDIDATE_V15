import { describe, expect, it } from 'vitest';
import {
  anchorValue,
  DEFAULT_PLAN_POLICY,
  planAnchorBatch,
  type AnchorCandidate,
} from '../src/anchor-plan.js';

const cand = (over: Partial<AnchorCandidate> = {}): AnchorCandidate => ({
  slotKey: `${over.entityId ?? 'e:1'}|${over.attribute ?? 'weight_g'}`,
  entityId: 'e:1',
  entityLabel: 'E1',
  attribute: 'weight_g',
  stratum: 'physical',
  gateCoverageGain: 0,
  decisiveDecisions: 0,
  disputeSpread: 0,
  anchorAgeDays: null,
  measurementCostMinutes: 10,
  feasible: true,
  ...over,
});

describe('anchorValue', () => {
  it('ranks first-in-family coverage above incremental decision impact', () => {
    const coverage = anchorValue(cand({ gateCoverageGain: 1 }), DEFAULT_PLAN_POLICY);
    const impact = anchorValue(
      cand({ decisiveDecisions: 40, disputeSpread: 1 }),
      DEFAULT_PLAN_POLICY,
    );
    expect(coverage).toBeGreaterThan(impact);
  });

  it('saturates in decision count rather than scaling linearly', () => {
    const p = DEFAULT_PLAN_POLICY;
    const ten = anchorValue(cand({ decisiveDecisions: 10, disputeSpread: 1 }), p);
    const many = anchorValue(cand({ decisiveDecisions: 500, disputeSpread: 1 }), p);
    expect(many / ten).toBeLessThan(3);
  });

  it('decays the value of re-measuring a fresh anchor', () => {
    const p = DEFAULT_PLAN_POLICY;
    const fresh = anchorValue(cand({ gateCoverageGain: 2, anchorAgeDays: 5 }), p);
    const never = anchorValue(cand({ gateCoverageGain: 2, anchorAgeDays: null }), p);
    expect(fresh).toBeLessThan(never);
  });
});

describe('planAnchorBatch', () => {
  const many = (n: number, stratum: string, over: Partial<AnchorCandidate> = {}) =>
    Array.from({ length: n }, (_, i) =>
      cand({ ...over, entityId: `e:${stratum}-${i}`, stratum, slotKey: `e:${stratum}-${i}|a` }),
    );

  it('always reserves budget for blind samples even when targets look valuable', () => {
    const plan = planAnchorBatch(
      many(50, 'physical', { gateCoverageGain: 5, decisiveDecisions: 100 }),
      { ...DEFAULT_PLAN_POLICY, budgetMinutes: 100, explorationFraction: 0.3 },
    );
    expect(plan.exploratory.length).toBeGreaterThan(0);
    const exploreMinutes = plan.exploratory.reduce((s, p) => s + p.measurementCostMinutes, 0);
    expect(exploreMinutes).toBeLessThanOrEqual(30);
  });

  it('caps any single stratum within the targeted budget', () => {
    const plan = planAnchorBatch(
      [
        ...many(40, 'physical', { gateCoverageGain: 4 }),
        ...many(40, 'optical', { gateCoverageGain: 1 }),
      ],
      { ...DEFAULT_PLAN_POLICY, budgetMinutes: 200, explorationFraction: 0.2, maxStratumShare: 0.5 },
    );
    const physical = plan.targeted
      .filter((p) => p.stratum === 'physical')
      .reduce((s, p) => s + p.measurementCostMinutes, 0);
    expect(physical).toBeLessThanOrEqual(200 * 0.8 * 0.5);
  });

  it('never double-books a slot across arms', () => {
    const plan = planAnchorBatch(many(30, 'physical', { decisiveDecisions: 5 }));
    const keys = [...plan.targeted, ...plan.exploratory].map((p) => p.slotKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('excludes infeasible candidates and reports the count', () => {
    const plan = planAnchorBatch([
      cand({ feasible: false, gateCoverageGain: 9 }),
      cand({ entityId: 'e:2', slotKey: 'e:2|a', gateCoverageGain: 1 }),
    ]);
    expect(plan.skippedInfeasible).toBe(1);
    expect([...plan.targeted, ...plan.exploratory].every((p) => p.slotKey !== 'e:1|weight_g')).toBe(true);
  });

  it('is reproducible for the same inputs and seed', () => {
    const input = many(30, 'physical');
    expect(planAnchorBatch(input)).toEqual(planAnchorBatch(input));
  });
});
