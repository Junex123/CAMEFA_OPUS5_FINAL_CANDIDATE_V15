import { describe, expect, it } from 'vitest';
import { assessCandidateCoverage, imputeMissing, MIN_SOFT_COVERAGE } from '../src/coverage.js';
import type { ProfileTerm } from '../src/coverage.js';
import type { AttributeValue, Candidate } from '../src/candidate.js';

const req = (requirementId: string, attributeId: string) => ({
  requirementId,
  attributeId,
  hard: false,
  curve: [
    { at: 0, satisfaction: 0 },
    { at: 1, satisfaction: 1 },
  ],
  rationale: 'test',
});

const term = (
  requirementId: string,
  attributeId: string,
  weight: number,
  hard = false,
): ProfileTerm => ({
  requirementId,
  attributeId,
  hard,
  weight,
  emphasis: 'wanted',
  requirement: { ...req(requirementId, attributeId), hard },
  rationale: 'test',
});

const val = (value: number): AttributeValue => ({
  value,
  unit: 'count',
  evidence: [],
  confidence: 0.9,
  derived: false,
  derivationId: null,
  conflictId: null,
  imputed: false,
  outlierFlags: [],
});

const candidate = (entityId: string, entries: [string, number][]): Candidate => ({
  entityId,
  label: entityId,
  entityType: 'camera_body',
  values: new Map(entries.map(([a, v]) => [a, val(v)])),
});

describe('assessCandidateCoverage', () => {
  const terms = [term('r1', 'a', 2), term('r2', 'b', 1), term('r3', 'c', 1)];

  it('admits a fully covered candidate', () => {
    const v = assessCandidateCoverage(candidate('e:1', [['a', 1], ['b', 1], ['c', 1]]), terms);
    expect(v).toMatchObject({ admissible: true, softCoverage: 1, reason: null });
  });

  it('excludes a candidate with no evidence for a hard requirement', () => {
    const hard = [...terms, term('r4', 'd', 4, true)];
    const v = assessCandidateCoverage(candidate('e:1', [['a', 1], ['b', 1], ['c', 1]]), hard);
    expect(v.admissible).toBe(false);
    expect(v.reason).toMatch(/hard requirement/);
  });

  it('excludes a candidate below the soft coverage floor', () => {
    const v = assessCandidateCoverage(candidate('e:1', [['b', 1]]), terms);
    expect(v.softCoverage).toBeCloseTo(0.25, 6);
    expect(v.admissible).toBe(false);
  });

  it('weights coverage by emphasis rather than counting attributes', () => {
    const heavy = assessCandidateCoverage(candidate('e:1', [['a', 1]]), terms);
    expect(heavy.softCoverage).toBeCloseTo(0.5, 6);
    expect(heavy.admissible).toBe(MIN_SOFT_COVERAGE <= 0.5);
  });
});

describe('imputeMissing', () => {
  const terms = [term('r1', 'weight_g', 2)];

  it('fills a gap with the worst observed value for a lower-is-better attribute', () => {
    const floors = imputeMissing(
      [candidate('e:1', [['weight_g', 600]]), candidate('e:2', [['weight_g', 950]])],
      terms,
      () => 'lower_better',
    );
    expect(floors.get('weight_g')).toMatchObject({ value: 950, imputed: true, confidence: 0 });
  });

  it('fills a gap with the lowest observed value for a higher-is-better attribute', () => {
    const floors = imputeMissing(
      [candidate('e:1', [['weight_g', 12]]), candidate('e:2', [['weight_g', 4]])],
      terms,
      () => 'higher_better',
    );
    expect(floors.get('weight_g')?.value).toBe(4);
  });

  it('imputes nothing when no candidate observed the attribute', () => {
    expect(imputeMissing([candidate('e:1', [])], terms, () => 'lower_better').size).toBe(0);
  });

  it('never imputes hard requirements', () => {
    const floors = imputeMissing(
      [candidate('e:1', [['price_usd', 3000]])],
      [term('r', 'price_usd', 4, true)],
      () => 'lower_better',
    );
    expect(floors.size).toBe(0);
  });
});
