import { describe, expect, it } from 'vitest';
import { sealReceipt, verifyReceipt, type DecisionReceipt } from '../src/receipt.js';

const draft = (winner: string | null): Omit<DecisionReceipt, 'receiptId'> => ({
  schema: 'camefa.receipt/1',
  sealedAt: '2026-01-01T00:00:00.000Z',
  epoch: { id: 'epoch:test' },
  versions: { build: 'b', ontology: 'o', capability: 'c', reasoning: 'r' },
  request: {
    profile: 'test',
    candidates: ['a', 'b'],
    constraints: [],
    weights: [{ attribute: 'capability.test', weight: 1 }],
    locale: 'en',
  },
  decision: winner === null
    ? { outcome: 'none_qualify', winner: null, ranking: [], eliminated: [{ slot: 'a', reason: { kind: 'insufficient_coverage', attributes: ['capability.test'] } }] }
    : { outcome: 'ranked', winner, ranking: [{ slot: winner, score: 0.8 }], eliminated: [] },
  coverage: { belowFloor: false, withheldByLicense: 0, perAttribute: [] },
  lineage: { nodeId: 'r', kind: 'aggregation', label: 'test', children: [] },
  cost: { evidenceReads: 0, derivations: 0, scoringPasses: 0, wallClockMs: 0, fragility: { evidenceReads: 0, derivations: 0, scoringPasses: 0, wallClockMs: 0, exhausted: false } },
});

describe('DecisionReceipt', () => {
  it('seals and verifies a ranked decision', () => {
    const receipt = sealReceipt(draft('a'));
    expect(verifyReceipt(receipt).ok).toBe(true);
  });

  it('allows an explicit none-qualify outcome', () => {
    const receipt = sealReceipt(draft(null));
    expect(receipt.decision.outcome).toBe('none_qualify');
    expect(verifyReceipt(receipt).ok).toBe(true);
  });
});
