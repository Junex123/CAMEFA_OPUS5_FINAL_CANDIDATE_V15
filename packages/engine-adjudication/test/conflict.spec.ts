import { describe, expect, it } from 'vitest';
import {
  compositionHashOf,
  conflictIdOf,
  detectConflict,
  effectiveJnd,
  precisionTolerance,
  type ClaimView,
} from '../src/conflict.js';

const slot = {
  entityId: 'e:r6ii',
  entityLabel: 'Canon EOS R6 II',
  attribute: 'weight_g',
  window: '2026-Q1',
};

const claim = (over: Partial<ClaimView> = {}): ClaimView => ({
  claimId: 'c:1',
  entityId: slot.entityId,
  attribute: 'weight_g',
  value: 670,
  unit: 'g',
  sourceId: 'src:a',
  precision: 0,
  approximate: false,
  reliabilityAtRead: 0.9,
  observedAt: '2026-01-01T00:00:00.000Z',
  outlierFlags: [],
  ...over,
});

const now = '2026-02-01T00:00:00.000Z';

describe('conflictIdOf', () => {
  it('is stable as evidence changes', () => {
    expect(conflictIdOf(slot)).toBe('slot:e:r6ii|weight_g|2026-Q1');
  });

  it('separates windows', () => {
    expect(conflictIdOf({ ...slot, window: '2026-Q2' })).not.toBe(conflictIdOf(slot));
  });
});

describe('compositionHashOf', () => {
  it('is order-independent', () => {
    expect(compositionHashOf([claim({ claimId: 'c:2' }), claim()])).toBe(
      compositionHashOf([claim(), claim({ claimId: 'c:2' })]),
    );
  });

  it('changes when a claim is added', () => {
    expect(compositionHashOf([claim()])).not.toBe(
      compositionHashOf([claim(), claim({ claimId: 'c:2' })]),
    );
  });
});

describe('precisionTolerance', () => {
  it('widens for coarsely stated values', () => {
    expect(precisionTolerance(claim({ precision: 0 }))).toBeCloseTo(0.5, 9);
    expect(precisionTolerance(claim({ precision: 1 }))).toBeCloseTo(0.05, 9);
  });

  it('widens much further for hedged values', () => {
    expect(precisionTolerance(claim({ value: 700, approximate: true }))).toBeCloseTo(35, 6);
  });
});

describe('effectiveJnd', () => {
  it('never narrows below the ontology base', () => {
    expect(effectiveJnd(5, [claim({ precision: 2 })]).threshold).toBe(5);
  });

  it('widens to the coarser source when precision demands it', () => {
    const j = effectiveJnd(0.1, [claim({ precision: 0 }), claim({ precision: 2 })]);
    expect(j.threshold).toBeCloseTo(0.5, 9);
  });
});

describe('detectConflict', () => {
  it('opens a conflict when sources disagree beyond the jnd', () => {
    const c = detectConflict(
      slot,
      [claim({ value: 670 }), claim({ claimId: 'c:2', sourceId: 'src:b', value: 690 })],
      5,
      now,
    );
    expect(c?.spread).toBe(20);
    expect(c?.conflictId).toBe('slot:e:r6ii|weight_g|2026-Q1');
  });

  it('does not open a conflict over rounding', () => {
    const c = detectConflict(
      slot,
      [
        claim({ value: 670, precision: 0 }),
        claim({ claimId: 'c:2', sourceId: 'src:b', value: 670.4, precision: 1 }),
      ],
      0.1,
      now,
    );
    expect(c).toBeNull();
  });

  it('does not open a conflict within the ontology jnd', () => {
    expect(
      detectConflict(
        slot,
        [claim({ value: 670 }), claim({ claimId: 'c:2', sourceId: 'src:b', value: 673 })],
        5,
        now,
      ),
    ).toBeNull();
  });

  it('ignores a single source disagreeing with itself', () => {
    expect(
      detectConflict(
        slot,
        [claim({ value: 670 }), claim({ claimId: 'c:2', value: 900 })],
        5,
        now,
      ),
    ).toBeNull();
  });

  it('needs at least two claims', () => {
    expect(detectConflict(slot, [claim()], 5, now)).toBeNull();
  });

  it('tolerates a hedged claim against a precise one', () => {
    expect(
      detectConflict(
        slot,
        [
          claim({ value: 700, approximate: true }),
          claim({ claimId: 'c:2', sourceId: 'src:b', value: 672, precision: 0 }),
        ],
        5,
        now,
      ),
    ).toBeNull();
  });
});
