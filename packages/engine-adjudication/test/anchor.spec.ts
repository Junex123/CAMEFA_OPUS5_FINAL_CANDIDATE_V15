import { describe, expect, it } from 'vitest';
import { AnchorError, assertAnchorEligible, judgeAgainstAnchor, type Anchor } from '../src/anchor.js';

const anchor = (over: Partial<Anchor> = {}): Anchor => ({
  anchorId: 'anc:1',
  conflictId: 'conf:1',
  entityId: 'e:1',
  attribute: 'weight_g',
  value: 658,
  unit: 'g',
  basis: 'measured',
  instrument: 'AWS-1000',
  blind: true,
  establishedAt: '2026-02-01T00:00:00.000Z',
  establishedBy: 'usr:1',
  ...over,
});

describe('assertAnchorEligible', () => {
  it('accepts a blind instrumented measurement', () => {
    expect(() => assertAnchorEligible(anchor())).not.toThrow();
  });

  it('refuses a measurement taken with the engine value visible', () => {
    expect(() => assertAnchorEligible(anchor({ blind: false }))).toThrow(/must be blind/);
  });

  it('refuses a measurement with no named instrument', () => {
    expect(() => assertAnchorEligible(anchor({ instrument: null }))).toThrow(AnchorError);
  });

  it('allows escalation without an instrument', () => {
    expect(() =>
      assertAnchorEligible(anchor({ basis: 'escalated', instrument: null, blind: false })),
    ).not.toThrow();
  });

  it('refuses a non-finite value', () => {
    expect(() => assertAnchorEligible(anchor({ value: Number.NaN }))).toThrow(/non-finite/);
  });
});

describe('judgeAgainstAnchor', () => {
  it('splits claims by the jnd around the measured value', () => {
    const v = judgeAgainstAnchor(
      anchor(),
      [
        { claimId: 'c:1', value: 660 },
        { claimId: 'c:2', value: 690 },
      ],
      5,
    );
    expect(v.correctClaimIds).toEqual(['c:1']);
    expect(v.incorrectClaimIds).toEqual(['c:2']);
  });

  it('counts a claim exactly at the jnd boundary as correct', () => {
    const v = judgeAgainstAnchor(anchor(), [{ claimId: 'c:1', value: 663 }], 5);
    expect(v.correctClaimIds).toEqual(['c:1']);
  });
});
