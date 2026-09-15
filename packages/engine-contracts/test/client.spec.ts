import { describe, expect, it } from 'vitest';
import { EngineClient } from '../src/client.js';

const req = { activityProfile: 'wildlife.birds', constraints: { budgetUsd: 6000 } };

describe('EngineClient.estimate', () => {
  it('returns a budget for every metered dimension of the operation', () => {
    expect(Object.keys(EngineClient.estimate('evaluate', req)).sort()).toEqual([
      'claimReads',
      'derivations',
      'solverNodes',
      'wallMs',
    ]);
  });

  it('budgets solve more generously than evaluate', () => {
    const e = EngineClient.estimate('evaluate', req).solverNodes!;
    const s = EngineClient.estimate('solve', req).solverNodes!;
    expect(s).toBeGreaterThan(e);
  });

  it('grows sub-linearly with candidate breadth', () => {
    const small = EngineClient.estimate('evaluate', { ...req, candidateIds: ['a', 'b'] });
    const large = EngineClient.estimate('evaluate', {
      ...req,
      candidateIds: Array.from({ length: 256 }, (_, i) => `e:${i}`),
    });
    expect(large.solverNodes! / small.solverNodes!).toBeLessThan(4);
    expect(large.solverNodes!).toBeGreaterThan(small.solverNodes!);
  });

  it('never returns fractional budgets', () => {
    const est = EngineClient.estimate('evaluate', { ...req, candidateIds: ['a', 'b', 'c'] });
    for (const v of Object.values(est)) expect(Number.isInteger(v)).toBe(true);
  });
});
