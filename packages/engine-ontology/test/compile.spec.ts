import { describe, expect, it } from 'vitest';
import { compileOntology, OntologyCompileError } from '../src/compile.js';
import type { OntologyPackSource } from '../src/pack.js';

const attr = (attributeId: string, over: Partial<OntologyPackSource['attributes'][number]> = {}) => ({
  attributeId,
  type: 'numeric' as const,
  unit: 'g',
  direction: 'lower_better' as const,
  jnd: 5,
  plausible: { min: 100, max: 3000 },
  label: attributeId,
  derived: false,
  ...over,
});

const pack = (over: Partial<OntologyPackSource> = {}): OntologyPackSource => ({
  packId: 'camera.core',
  version: '1.0.0',
  attributes: [attr('weight_g')],
  requirements: [
    {
      requirementId: 'req:portable',
      attributeId: 'weight_g',
      hard: false,
      curve: [
        { at: 500, satisfaction: 1 },
        { at: 1500, satisfaction: 0 },
      ],
      rationale: 'All-day handheld work is limited by carried mass.',
    },
  ],
  profiles: [
    {
      profileId: 'travel.light',
      label: 'Travel, light',
      appliesTo: ['camera_body'],
      requirements: [
        { requirementId: 'req:portable', emphasis: 'critical', rationale: 'The whole point of the profile.' },
      ],
    },
  ],
  derivationPacks: ['camera.core'],
  ...over,
});

const errorsOf = (fn: () => unknown): string[] => {
  try {
    fn();
    return [];
  } catch (e) {
    if (e instanceof OntologyCompileError) return e.diagnostics.map((d) => d.code);
    throw e;
  }
};

describe('compileOntology', () => {
  it('compiles a well-formed pack and exposes per-pack fingerprints', () => {
    const c = compileOntology([pack()], 'mdl:1');
    expect(c.packs).toHaveLength(1);
    expect(c.packs[0].fingerprint).toMatch(/^h1:[0-9a-f]{64}$/);
    expect(c.derivationPacks).toEqual(['camera.core']);
    expect(c.modelRef).toBe('mdl:1');
  });

  it('fingerprints packs independently of declaration order within the pack', () => {
    const a = compileOntology([pack({ attributes: [attr('weight_g'), attr('height_mm', { unit: 'mm' })] })], 'mdl:1');
    const b = compileOntology([pack({ attributes: [attr('height_mm', { unit: 'mm' }), attr('weight_g')] })], 'mdl:1');
    expect(a.packs[0].fingerprint).toBe(b.packs[0].fingerprint);
    expect(a.ontologyFingerprint).toBe(b.ontologyFingerprint);
  });

  it('changes the ontology fingerprint when modelRef changes', () => {
    expect(compileOntology([pack()], 'mdl:1').ontologyFingerprint).not.toBe(
      compileOntology([pack()], 'mdl:2').ontologyFingerprint,
    );
  });

  it('refuses a numeric attribute with no jnd', () => {
    expect(errorsOf(() => compileOntology([pack({ attributes: [attr('weight_g', { jnd: null })] })], 'm'))).toContain(
      'incoherent_attribute',
    );
  });

  it('refuses duplicate attribute ids across packs rather than merging them', () => {
    const other = pack({ packId: 'camera.pro', requirements: [], profiles: [] });
    const codes = errorsOf(() => compileOntology([pack(), other], 'm'));
    expect(codes).toContain('duplicate_attribute');
  });

  it('refuses unknown units', () => {
    expect(errorsOf(() => compileOntology([pack({ attributes: [attr('weight_g', { unit: 'stone' })] })], 'm'))).toContain(
      'incoherent_attribute',
    );
  });

  it('refuses requirements pointing at undefined attributes', () => {
    const codes = errorsOf(() =>
      compileOntology([pack({ attributes: [attr('height_mm', { unit: 'mm' })] })], 'm'),
    );
    expect(codes).toContain('unknown_attribute');
  });

  it('refuses a profile whose total emphasis is zero', () => {
    const codes = errorsOf(() =>
      compileOntology(
        [
          pack({
            profiles: [
              {
                profileId: 'travel.light',
                label: 'x',
                appliesTo: ['camera_body'],
                requirements: [
                  { requirementId: 'req:portable', emphasis: 'irrelevant', rationale: 'why not' },
                ],
              },
            ],
          }),
        ],
        'm',
      ),
    );
    expect(codes).toContain('unweighted_profile');
  });

  it('refuses requirements and profile entries with no rationale', () => {
    const codes = errorsOf(() =>
      compileOntology(
        [pack({ requirements: [{ ...pack().requirements[0], rationale: '  ' }] })],
        'm',
      ),
    );
    expect(codes).toContain('missing_rationale');
  });

  it('collects every diagnostic in one pass', () => {
    const codes = errorsOf(() =>
      compileOntology(
        [
          pack({
            attributes: [attr('weight_g', { jnd: null }), attr('bad_unit', { unit: 'furlong' })],
            profiles: [
              {
                profileId: 'p',
                label: 'p',
                appliesTo: [],
                requirements: [{ requirementId: 'req:ghost', emphasis: 'critical', rationale: 'x' }],
              },
            ],
          }),
        ],
        'm',
      ),
    );
    expect(codes.length).toBeGreaterThan(2);
  });

  it('reports the attribute closure each profile depends on', () => {
    const c = compileOntology([pack()], 'mdl:1');
    expect(c.profileDependencies.get('travel.light')).toEqual(['weight_g']);
  });
});
