import { describe, expect, it } from 'vitest';
import { checkExpectations } from '../src/expectation.js';

const receipt = {
  outcome: {
    ranked: [
      { entityId: 'a', score: 0.9, eliminated: false, binding: null },
      { entityId: 'b', score: 0.7, eliminated: false, binding: null },
      {
        entityId: 'c',
        score: 0,
        eliminated: true,
        binding: { requirement: 'budgetUsd', margin: -420 },
      },
    ],
  },
} as never;

describe('checkExpectations', () => {
  it('checks relative ordering over live candidates', () => {
    const [r] = checkExpectations(receipt, [
      {
        id: 'e1',
        provenance: 'anchor',
        anchorId: 'anc:1',
        rationale: 'measured AF hit rate',
        assert: { kind: 'ranks_above', winner: 'a', loser: 'b' },
      },
    ]);
    expect(r.satisfied).toBe(true);
  });

  it('fails an elimination expectation when the reason differs', () => {
    const [r] = checkExpectations(receipt, [
      {
        id: 'e2',
        provenance: 'anchor',
        anchorId: 'anc:2',
        rationale: 'body lacks required flash sync',
        assert: { kind: 'eliminated', entityId: 'c', requirement: 'flashSync' },
      },
    ]);
    expect(r.satisfied).toBe(false);
    expect(r.detail).toContain('eliminated by budgetUsd');
  });

  it('does not count eliminated candidates toward top-n', () => {
    const [r] = checkExpectations(receipt, [
      {
        id: 'e3',
        provenance: 'editorial',
        rationale: 'should stay shortlisted',
        assert: { kind: 'in_top_n', entityId: 'c', n: 3 },
      },
    ]);
    expect(r.satisfied).toBe(false);
  });
});
