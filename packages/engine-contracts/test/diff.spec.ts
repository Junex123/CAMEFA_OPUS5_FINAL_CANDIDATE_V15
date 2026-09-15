import { describe, expect, it } from 'vitest';
import { diffReceipts, kendallTauDistance } from '../src/diff.js';
import type { DecisionReceipt } from '../src/receipt.js';

const receipt = (
  id: string,
  ranked: { entityId: string; score: number; eliminated?: boolean }[],
  engine: Partial<DecisionReceipt['engine']> = {},
  claimSetHash = 'ev:1',
): DecisionReceipt =>
  ({
    receiptId: id,
    question: { key: 'q:wedding@4000', label: 'wedding under $4000' },
    inputs: { claimSetHash },
    engine: {
      ontologyFingerprint: 'ont:1',
      modelRef: 'mdl:1',
      calibrationRef: 'cal:1',
      reliabilityFingerprint: 'rel:1',
      ...engine,
    },
    outcome: {
      aggregationP: -0.5,
      ranked: ranked.map((r) => ({
        label: r.entityId.toUpperCase(),
        confidence: 0.9,
        binding: null,
        eliminated: false,
        ...r,
      })),
    },
    cost: {},
    sealedAt: '2026-01-01T00:00:00.000Z',
    replayable: true,
  }) as unknown as DecisionReceipt;

describe('kendallTauDistance', () => {
  it('is zero for identical orders', () => {
    expect(kendallTauDistance(['a', 'b', 'c'], ['a', 'b', 'c']).normalized).toBe(0);
  });

  it('is one for a full reversal', () => {
    expect(kendallTauDistance(['a', 'b', 'c'], ['c', 'b', 'a']).normalized).toBe(1);
  });

  it('ignores entities absent from one side', () => {
    const t = kendallTauDistance(['a', 'x', 'b'], ['a', 'b']);
    expect(t).toEqual({ discordant: 0, pairs: 1, normalized: 0 });
  });
});

describe('diffReceipts', () => {
  it('attributes a reordering to the single changed dimension', () => {
    const d = diffReceipts(
      receipt('r:a', [{ entityId: 'a', score: 0.8 }, { entityId: 'b', score: 0.7 }]),
      receipt(
        'r:b',
        [{ entityId: 'b', score: 0.82 }, { entityId: 'a', score: 0.79 }],
        { calibrationRef: 'cal:2' },
      ),
    );
    expect(d.attribution).toEqual({
      kind: 'attributable',
      dimensions: ['calibrationRef'],
    });
    expect(d.winnerChanged).toBe(true);
    expect(d.tau.normalized).toBe(1);
  });

  it('flags a determinism violation when nothing versioned changed', () => {
    const d = diffReceipts(
      receipt('r:a', [{ entityId: 'a', score: 0.8 }, { entityId: 'b', score: 0.7 }]),
      receipt('r:b', [{ entityId: 'b', score: 0.9 }, { entityId: 'a', score: 0.8 }]),
    );
    expect(d.attribution).toEqual({
      kind: 'unattributable',
      reason: 'determinism_violation',
    });
  });

  it('reports identical when nothing moved', () => {
    const rows = [{ entityId: 'a', score: 0.8 }, { entityId: 'b', score: 0.7 }];
    const d = diffReceipts(receipt('r:a', rows), receipt('r:b', rows));
    expect(d.attribution).toEqual({ kind: 'identical' });
    expect(d.maxScoreDelta).toBe(0);
  });

  it('refuses to compare different questions', () => {
    const a = receipt('r:a', [{ entityId: 'a', score: 0.8 }]);
    const b = receipt('r:b', [{ entityId: 'a', score: 0.8 }]);
    (b.question as { key: string }).key = 'q:wildlife@4000';
    expect(diffReceipts(a, b).attribution).toMatchObject({ kind: 'incomparable' });
  });

  it('classifies entries, exits and elimination flips', () => {
    const d = diffReceipts(
      receipt('r:a', [
        { entityId: 'a', score: 0.8 },
        { entityId: 'b', score: 0.0, eliminated: true },
        { entityId: 'c', score: 0.5 },
      ]),
      receipt(
        'r:b',
        [
          { entityId: 'a', score: 0.8 },
          { entityId: 'b', score: 0.6 },
          { entityId: 'd', score: 0.4 },
        ],
        { ontologyFingerprint: 'ont:2' },
      ),
    );
    const by = Object.fromEntries(d.rows.map((r) => [r.entityId, r.movement]));
    expect(by).toMatchObject({ b: 'revived', c: 'left', d: 'entered' });
    expect(d.eliminationFlips).toEqual([
      { entityId: 'b', label: 'B', to: 'in' },
    ]);
  });
});
