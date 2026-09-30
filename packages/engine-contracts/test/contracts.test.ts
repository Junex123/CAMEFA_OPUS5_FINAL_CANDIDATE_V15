import { describe, expect, it } from 'vitest';
import { estimateCost, sealReceipt, verifyAddress, type DecisionReceipt } from '../src/index.js';

const request = {
  profile: 'camera.comparison',
  candidates: ['body.a', 'body.b'],
  constraints: [],
  weights: [{ attribute: 'lowlight.iso_headroom', weight: 1 }],
  locale: 'en',
} as const;

const receipt = (cost = 1): Omit<DecisionReceipt, 'receiptId'> => ({
  schema: 'camefa.receipt/1',
  sealedAt: '2026-01-01T00:00:00.000Z',
  epoch: { id: 'engine:dev', version: '1', fingerprint: 'epoch' },
  versions: { build: 'dev', ontology: 'ontology', capability: 'capability', reasoning: 'reasoning' },
  request,
  decision: {
    outcome: 'ranked',
    winner: 'body.a',
    ranking: [{ slot: 'body.a', score: 0.8 }, { slot: 'body.b', score: 0.6 }],
    eliminated: [],
  },
  coverage: { belowFloor: false, withheldByLicense: 0, perAttribute: [] },
  lineage: {
    nodeId: 'root',
    kind: 'aggregation',
    label: 'test',
    children: [],
  },
  cost: {
    evidenceReads: cost,
    derivations: 0,
    scoringPasses: 0,
    wallClockMs: 0,
    fragility: { evidenceReads: 0, derivations: 0, scoringPasses: 0, wallClockMs: 0, exhausted: false },
  },
});

describe('V16 contract surface', () => {
  it('estimates cost from candidate breadth', () => {
    const one = estimateCost('evaluate', request.candidates.length);
    const many = estimateCost('evaluate', 32);
    expect(many.evidenceReads).toBeGreaterThan(one.evidenceReads);
  });

  it('seals receipts symmetrically', () => {
    const sealed = sealReceipt(receipt());
    expect(sealed.receiptId).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyAddress(sealed)).toBe(true);
  });
});
