import { describe, expect, it } from 'vitest';
import { analyseLeverage, type ContestedSlot } from '../src/leverage.js';
import type { Candidate } from '../src/sensitivity';

const candidates: Candidate[] = [
  {
    entityId: 'a',
    label: 'A',
    eliminated: false,
    terms: [
      { requirement: 'weight', weight: 1, value: 0.72 },
      { requirement: 'reach', weight: 1, value: 0.7 },
    ],
  },
  {
    entityId: 'b',
    label: 'B',
    eliminated: false,
    terms: [
      { requirement: 'weight', weight: 1, value: 0.7 },
      { requirement: 'reach', weight: 1, value: 0.7 },
    ],
  },
];

const slot = (over: Partial<ContestedSlot> = {}): ContestedSlot => ({
  conflictId: 'slot:a|weight|2026-Q1',
  entityId: 'a',
  requirement: 'weight',
  valueLow: 0.71,
  valueHigh: 0.73,
  resolved: false,
  ...over,
});

describe('analyseLeverage', () => {
  it('marks a conflict decisive when the claim spread exceeds the flip delta', () => {
    const [f] = analyseLeverage(candidates, [
      slot({ valueLow: 0.55, valueHigh: 0.73 }),
    ]);
    expect(f.flipDelta).not.toBeNull();
    expect(f.decisive).toBe(true);
  });

  it('leaves a conflict non-decisive when sources barely disagree', () => {
    const [f] = analyseLeverage(candidates, [
      slot({ valueLow: 0.719, valueHigh: 0.721 }),
    ]);
    expect(f.decisive).toBe(false);
  });

  it('returns a null flip delta when no value change can move the winner', () => {
    const dominated: Candidate[] = [
      { ...candidates[0], terms: [{ requirement: 'weight', weight: 1, value: 0.95 }] },
      { ...candidates[1], terms: [{ requirement: 'weight', weight: 0, value: 0.1 }] },
    ];
    const [f] = analyseLeverage(dominated, [slot({ entityId: 'b' })]);
    expect(f.flipDelta).toBeNull();
    expect(f.decisive).toBe(false);
  });

  it('handles a conflict on an entity absent from the race', () => {
    const [f] = analyseLeverage(candidates, [slot({ entityId: 'zzz' })]);
    expect(f).toMatchObject({ flipDelta: null, decisive: false });
  });
});
