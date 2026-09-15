import { describe, it, expect } from 'vitest';
import { validate, renderTemplate, Explainer, type GeneratedSegment } from '../src/index.js';
import type { NarrativePlan, PlanNodeId } from '../src/plan.js';

const plan: NarrativePlan = {
  id: 'plan-1',
  hedgeFloor: 'measured',
  entityLabels: new Map([['e1', 'Fixture Flagship']]),
  omitted: [],
  nodes: [
    {
      id: 'verdict' as PlanNodeId, role: 'verdict', salience: 1, hedge: 'measured',
      facts: [{ label: 'fit', display: '0.81', numeric: 0.81, unit: null, capability: null, claimIds: ['c1'] }],
      template: 'Fixture Flagship is the strongest fit.',
    },
    {
      id: 'driver:r1' as PlanNodeId, role: 'because', salience: 0.4, hedge: 'qualified',
      facts: [{ label: 'Low-light headroom', display: '4.3 JND', numeric: 4.3, unit: null, capability: null, claimIds: ['c2'] }],
      template: 'It clears your low-light requirement comfortably.',
    },
  ],
};

const seg = (text: string, refs: string[], kind: GeneratedSegment['kind'] = 'assertion'): GeneratedSegment =>
  ({ text, refs: refs as PlanNodeId[], kind });

describe('citation validator', () => {
  it('accepts segments whose numbers are licensed by their refs', () => {
    expect(validate(plan, [seg('Fixture Flagship should suit you, scoring 0.81.', ['verdict'])])).toEqual([]);
  });

  it('rejects a fabricated number', () => {
    const v = validate(plan, [seg('It should deliver 15 stops of range.', ['driver:r1'])]);
    expect(v.some((x) => x.code === 'UNBOUND_NUMBER')).toBe(true);
  });

  it('rejects an assertion with no refs', () => {
    const v = validate(plan, [seg('It should be excellent for weddings.', [])]);
    expect(v[0]!.code).toBe('UNREFERENCED_ASSERTION');
  });

  it('rejects an unknown plan reference', () => {
    const v = validate(plan, [seg('It should work well.', ['driver:nonexistent'])]);
    expect(v.some((x) => x.code === 'UNKNOWN_REF')).toBe(true);
  });

  it('rejects language more confident than the hedge floor licenses', () => {
    const v = validate(plan, [seg('It will always clear your requirement.', ['driver:r1'])]);
    expect(v.some((x) => x.code === 'HEDGE_TOO_STRONG')).toBe(true);
  });

  it('accepts hedging stronger than licensed', () => {
    expect(validate(plan, [seg('It might clear your requirement.', ['driver:r1'])])).toEqual([]);
  });

  it('rejects an entity the plan never mentioned', () => {
    const v = validate(plan, [seg('Consider the Nikon instead, it should be better.', ['verdict'])]);
    expect(v.some((x) => x.code === 'UNBOUND_ENTITY')).toBe(true);
  });

  it('ignores connective segments', () => {
    expect(validate(plan, [seg('However,', [], 'connective')])).toEqual([]);
  });
});

describe('Explainer', () => {
  it('falls back to templates when the model keeps violating', async () => {
    const bad = { realize: async () => [seg('It will deliver 22 stops.', ['verdict'])] };
    let fallbacks = 0;
    const e = new Explainer(bad, () => { fallbacks += 1; });
    const out = await e.explain(plan);
    expect(out.source).toBe('template');
    expect(fallbacks).toBe(1);
    expect(out.text).toContain('strongest fit');
  });

  it('accepts a repaired second attempt', async () => {
    let call = 0;
    const flaky = {
      realize: async () => {
        call += 1;
        return call === 1
          ? [seg('It will deliver 99 stops.', ['verdict'])]
          : [seg('Fixture Flagship should suit you at 0.81.', ['verdict'])];
      },
    };
    const out = await new Explainer(flaky).explain(plan);
    expect(out.source).toBe('repaired');
  });

  it('falls back to templates when the realizer throws', async () => {
    const broken = { realize: async () => { throw new Error('model unavailable'); } };
    const out = await new Explainer(broken).explain(plan);
    expect(out.source).toBe('template');
  });

  it('renders templates with no realizer at all', () => {
    const out = renderTemplate(plan);
    expect(out.segments).toHaveLength(2);
    expect(out.violations).toEqual([]);
  });
});
