import { describe, expect, it } from 'vitest';
import { assertNoSyntheticClaims, planRetirement, RetirementError } from '../src/retire.js';

const syn = (id: string, refs: Partial<{ goldenQuestions: string[]; anchors: string[]; profiles: string[] }> = {}) => ({
  entityId: id,
  label: id,
  referencedBy: { goldenQuestions: [], anchors: [], profiles: [], ...refs },
});

const real = (id: string, attributesCovered: string[]) => ({
  entityId: id,
  label: id,
  claimCount: attributesCovered.length,
  attributesCovered,
});

describe('planRetirement', () => {
  it('is unsafe while a referenced synthetic has no mapping', () => {
    const plan = planRetirement(
      [syn('syn:body-a', { goldenQuestions: ['q:wedding@4000'] })],
      [real('e:canon-r6ii', ['weight_g'])],
      {},
      ['weight_g'],
    );
    expect(plan.safe).toBe(false);
    expect(plan.danglingReferences[0].referencedBy).toEqual(['q:wedding@4000']);
  });

  it('drops unreferenced synthetics without an alias', () => {
    const plan = planRetirement([syn('syn:filler')], [], {}, []);
    expect(plan.orphanedSynthetics).toEqual(['syn:filler']);
    expect(plan.safe).toBe(true);
  });

  it('blocks aliasing onto a real entity that is too thin', () => {
    const plan = planRetirement(
      [syn('syn:body-a', { anchors: ['anc:af-rate'] })],
      [real('e:canon-r6ii', ['weight_g'])],
      { 'syn:body-a': 'e:canon-r6ii' },
      ['weight_g', 'dr_stops_base'],
    );
    expect(plan.safe).toBe(false);
    expect(plan.underCovered[0].missing).toEqual(['dr_stops_base']);
  });

  it('throws when a mapping points at a nonexistent entity', () => {
    expect(() =>
      planRetirement([syn('syn:a')], [], { 'syn:a': 'e:ghost' }, []),
    ).toThrow(RetirementError);
  });

  it('produces aliases when every reference lands on a covered entity', () => {
    const plan = planRetirement(
      [syn('syn:body-a', { goldenQuestions: ['q:1'] })],
      [real('e:canon-r6ii', ['weight_g', 'dr_stops_base'])],
      { 'syn:body-a': 'e:canon-r6ii' },
      ['weight_g', 'dr_stops_base'],
    );
    expect(plan).toMatchObject({ safe: true, aliases: [{ from: 'syn:body-a', to: 'e:canon-r6ii' }] });
  });
});

describe('assertNoSyntheticClaims', () => {
  it('rejects synthetic sources and synthetic entity ids', () => {
    expect(() =>
      assertNoSyntheticClaims([{ entityId: 'e:real', sourceId: 'src:synthetic.seed' }]),
    ).toThrow(/synthetic/);
    expect(() =>
      assertNoSyntheticClaims([{ entityId: 'syn:x', sourceId: 'src:mfr.canon' }]),
    ).toThrow(/syn:x/);
  });

  it('passes a clean claim set', () => {
    expect(() =>
      assertNoSyntheticClaims([{ entityId: 'e:real', sourceId: 'src:mfr.canon' }]),
    ).not.toThrow();
  });
});
