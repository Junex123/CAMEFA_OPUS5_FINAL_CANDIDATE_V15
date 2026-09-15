import { describe, expect, it } from 'vitest';
import { CostMeter } from '@camefa/engine-kernel';
import type { AttributeDef } from '@camefa/engine-ontology';
import { scoreCandidate } from '../src/score.js';
import type { ProfileTerm } from '../src/coverage.js';
import type { AttributeValue } from '../src/candidate.js';

const attr = (attributeId: string, unit = 'count'): AttributeDef => ({
  attributeId,
  type: 'numeric',
  unit,
  direction: 'higher_better',
  jnd: 0.01,
  plausible: null,
  label: attributeId,
  derived: false,
});

const term = (id: string, attributeId: string, weight: number): ProfileTerm => ({
  requirementId: id,
  attributeId,
  hard: false,
  weight,
  emphasis: 'wanted',
  requirement: {
    requirementId: id,
    attributeId,
    hard: false,
    curve: [
      { at: 0, satisfaction: 0 },
      { at: 1, satisfaction: 1 },
    ],
    rationale: 'test',
  },
  rationale: 'test',
});

const value = (v: number, over: Partial<AttributeValue> = {}): AttributeValue => ({
  value: v,
  unit: 'count',
  evidence: [],
  confidence: 0.9,
  derived: false,
  derivationId: null,
  conflictId: null,
  imputed: false,
  outlierFlags: [],
  ...over,
});

const attributes = new Map([['a', attr('a')], ['b', attr('b')]]);
const terms = [term('r1', 'a', 1), term('r2', 'b', 1)];

describe('scoreCandidate', () => {
  it('penalises an unbalanced profile relative to a balanced one', () => {
    const balanced = scoreCandidate(
      'e:1',
      new Map([['a', value(0.6)], ['b', value(0.6)]]),
      terms,
      attributes,
      new CostMeter(),
    );
    const lopsided = scoreCandidate(
      'e:2',
      new Map([['a', value(1)], ['b', value(0.2)]]),
      terms,
      attributes,
      new CostMeter(),
    );
    expect(lopsided.score).toBeLessThan(balanced.score);
  });

  it('floors the score when any weighted requirement is wholly unmet', () => {
    const s = scoreCandidate(
      'e:1',
      new Map([['a', value(1)], ['b', value(0)]]),
      terms,
      attributes,
      new CostMeter(),
    );
    expect(s.score).toBe(0);
  });

  it('attributes contribution by leave-one-out, not by weighted share', () => {
    const s = scoreCandidate(
      'e:1',
      new Map([['a', value(0.9)], ['b', value(0.3)]]),
      terms,
      attributes,
      new CostMeter(),
    );
    const weak = s.terms.find((t) => t.attributeId === 'b')!;
    const strong = s.terms.find((t) => t.attributeId === 'a')!;
    // Removing the weak term raises the aggregate, so its contribution is negative.
    expect(weak.contribution).toBeLessThan(0);
    expect(strong.contribution).toBeGreaterThan(weak.contribution);
  });

  it('converts units before applying the satisfaction curve', () => {
    const attrs = new Map([['a', attr('a', 'g')]]);
    const s = scoreCandidate(
      'e:1',
      new Map([['a', value(0.5, { unit: 'kg' })]]),
      [term('r1', 'a', 1)],
      attrs,
      new CostMeter(),
    );
    expect(s.terms[0].rawValue).toBe(500);
    expect(s.terms[0].unit).toBe('g');
  });

  it('meters one solver node per scored term', () => {
    const meter = new CostMeter();
    scoreCandidate('e:1', new Map([['a', value(1)], ['b', value(1)]]), terms, attributes, meter);
    expect(meter.spent('solverNodes')).toBe(2);
  });

  it('takes confidence from the weakest supporting term', () => {
    const s = scoreCandidate(
      'e:1',
      new Map([['a', value(1, { confidence: 0.95 })], ['b', value(1, { confidence: 0.4 })]]),
      terms,
      attributes,
      new CostMeter(),
    );
    expect(s.confidence).toBeCloseTo(0.4, 6);
  });

  it('ignores hard requirements, which eliminate rather than score', () => {
    const s = scoreCandidate(
      'e:1',
      new Map([['a', value(1)]]),
      [{ ...term('r1', 'a', 4), hard: true }],
      attributes,
      new CostMeter(),
    );
    expect(s.terms).toHaveLength(0);
    expect(s.score).toBe(0);
  });
});
