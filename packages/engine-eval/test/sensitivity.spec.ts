import { describe, expect, it } from 'vitest';
import { analyseSensitivity, powerMean, type Candidate } from '../src/sensitivity';

const cand = (
  entityId: string,
  terms: [string, number, number][],
  eliminated = false,
): Candidate => ({
  entityId,
  label: entityId.toUpperCase(),
  eliminated,
  terms: terms.map(([requirement, weight, value]) => ({ requirement, weight, value })),
});

describe('powerMean', () => {
  it('is non-compensatory: surplus cannot offset a near-zero term', () => {
    const balanced = powerMean([
      { requirement: 'a', weight: 1, value: 0.6 },
      { requirement: 'b', weight: 1, value: 0.6 },
    ]);
    const lopsided = powerMean([
      { requirement: 'a', weight: 1, value: 1.0 },
      { requirement: 'b', weight: 1, value: 0.2 },
    ]);
    expect(lopsided).toBeLessThan(balanced);
  });

  it('floors at zero when any weighted requirement is unmet', () => {
    expect(
      powerMean([
        { requirement: 'a', weight: 1, value: 1 },
        { requirement: 'b', weight: 1, value: 0 },
      ]),
    ).toBe(0);
  });

  it('ignores zero-weight terms entirely', () => {
    const s = powerMean([
      { requirement: 'a', weight: 1, value: 0.5 },
      { requirement: 'b', weight: 0, value: 0 },
    ]);
    expect(s).toBeCloseTo(0.5, 6);
  });
});

describe('analyseSensitivity', () => {
  it('calls a dominated race robust and marks every requirement inert', () => {
    const r = analyseSensitivity([
      cand('a', [['reach', 1, 0.9], ['lowlight', 1, 0.9]]),
      cand('b', [['reach', 1, 0.4], ['lowlight', 1, 0.4]]),
    ]);
    expect(r.winnerId).toBe('a');
    expect(r.fragility).toBe('robust');
    expect(r.decidedBy).toBeNull();
    expect(r.inertRequirements).toEqual(['lowlight', 'reach']);
  });

  it('finds the requirement a close race actually hinges on', () => {
    const r = analyseSensitivity([
      cand('a', [['reach', 1, 0.85], ['lowlight', 1, 0.55]]),
      cand('b', [['reach', 1, 0.55], ['lowlight', 1, 0.87]]),
    ]);
    expect(r.winnerId).toBe('a');
    expect(r.decidedBy).not.toBeNull();
    expect(r.tornado[0].nearest?.challengerId).toBe('b');
  });

  it('classifies a near-tie as knife edge', () => {
    const r = analyseSensitivity([
      cand('a', [['reach', 1, 0.7], ['lowlight', 1, 0.701]]),
      cand('b', [['reach', 1, 0.701], ['lowlight', 1, 0.7]]),
    ]);
    expect(r.fragility).toBe('knife_edge');
    expect(r.minLogDistance!).toBeLessThan(Math.log(1.25));
  });

  it('is deterministic across repeated runs', () => {
    const build = () => [
      cand('a', [['reach', 1.3, 0.72], ['lowlight', 0.8, 0.61]]),
      cand('b', [['reach', 1.3, 0.66], ['lowlight', 0.8, 0.7]]),
    ];
    expect(analyseSensitivity(build())).toEqual(analyseSensitivity(build()));
  });

  it('excludes eliminated candidates from the race', () => {
    const r = analyseSensitivity([
      cand('a', [['reach', 1, 0.5]]),
      cand('b', [['reach', 1, 0.99]], true),
    ]);
    expect(r.winnerId).toBe('a');
    expect(r.runnerUpId).toBeNull();
  });

  it('reports undetermined when nothing survives', () => {
    const r = analyseSensitivity([cand('a', [['reach', 1, 0.5]], true)]);
    expect(r.fragility).toBe('undetermined');
    expect(r.winnerId).toBeNull();
  });
});
