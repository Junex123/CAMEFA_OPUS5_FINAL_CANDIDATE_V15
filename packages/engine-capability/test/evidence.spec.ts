import { describe, expect, it } from 'vitest';
import { confidenceOf, unionEvidence, type EvidenceRef } from '../src/evidence.js';

const ref = (claimId: string, over: Partial<EvidenceRef> = {}): EvidenceRef => ({
  claimId,
  entityId: 'e:1',
  attribute: 'weight_g',
  sourceId: 'src:a',
  reliability: 0.8,
  ...over,
});

describe('unionEvidence', () => {
  it('deduplicates by claimId', () => {
    expect(unionEvidence([ref('c1')], [ref('c1'), ref('c2')])).toHaveLength(2);
  });

  it('is order-independent and sorted', () => {
    const a = unionEvidence([ref('c2')], [ref('c1')]);
    const b = unionEvidence([ref('c1')], [ref('c2')]);
    expect(a).toEqual(b);
    expect(a.map((r) => r.claimId)).toEqual(['c1', 'c2']);
  });
});

describe('confidenceOf', () => {
  it('is zero with no evidence', () => {
    expect(confidenceOf([])).toBe(0);
  });

  it('raises slot confidence when independent sources corroborate', () => {
    const single = confidenceOf([ref('c1', { reliability: 0.8 })]);
    const both = confidenceOf([
      ref('c1', { reliability: 0.8 }),
      ref('c2', { sourceId: 'src:b', reliability: 0.8 }),
    ]);
    expect(single).toBeCloseTo(0.8, 6);
    expect(both).toBeCloseTo(0.96, 6);
  });

  it('treats repeat claims from one source as volume, not corroboration', () => {
    const repeated = confidenceOf([
      ref('c1', { reliability: 0.8 }),
      ref('c2', { reliability: 0.8 }),
    ]);
    expect(repeated).toBeCloseTo(0.8, 6);
  });

  it('is limited by the weakest input slot', () => {
    const c = confidenceOf([
      ref('c1', { attribute: 'weight_g', reliability: 0.95 }),
      ref('c2', { attribute: 'dr_stops_base', sourceId: 'src:b', reliability: 0.4 }),
    ]);
    expect(c).toBeCloseTo(0.4, 6);
  });

  it('does not double-penalise a claim shared across two branches', () => {
    const shared = ref('c1', { reliability: 0.9 });
    const viaOneBranch = confidenceOf([shared]);
    const viaFanIn = confidenceOf(unionEvidence([shared], [shared]));
    expect(viaFanIn).toBe(viaOneBranch);
  });
});
