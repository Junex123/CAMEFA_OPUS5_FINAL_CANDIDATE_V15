import { describe, expect, it } from 'vitest';
import type { RequirementDef } from '@camefa/engine-ontology';
import { bindingMargin, eliminate } from '../src/eliminate.js';

const budget: RequirementDef = {
  requirementId: 'req:budget',
  attributeId: 'price_usd',
  hard: true,
  curve: [
    { at: 4000, satisfaction: 1 },
    { at: 4001, satisfaction: 0 },
  ],
  rationale: 'Hard ceiling stated by the user.',
};

const flash: RequirementDef = {
  requirementId: 'req:flash_sync',
  attributeId: 'flash_sync_s',
  hard: true,
  curve: [
    { at: 0.004, satisfaction: 1 },
    { at: 0.008, satisfaction: 0 },
  ],
  rationale: 'Off-camera strobe work needs a fast sync speed.',
};

describe('bindingMargin', () => {
  it('is negative by the shortfall when unmet', () => {
    expect(bindingMargin(budget, 4420)).toBeCloseTo(-419, 6);
  });

  it('is positive by the headroom when met', () => {
    expect(bindingMargin(budget, 3600)).toBeCloseTo(400, 6);
  });
});

describe('eliminate', () => {
  it('passes a candidate meeting every hard requirement', () => {
    const r = eliminate([
      { requirement: budget, requirementId: 'req:budget', value: 3200 },
      { requirement: flash, requirementId: 'req:flash_sync', value: 0.004 },
    ]);
    expect(r).toMatchObject({ eliminated: false, binding: null });
  });

  it('reports the worst unmet requirement, not the first tested', () => {
    const r = eliminate([
      { requirement: flash, requirementId: 'req:flash_sync', value: 0.0081 },
      { requirement: budget, requirementId: 'req:budget', value: 9000 },
    ]);
    expect(r.binding?.requirement).toBe('req:budget');
  });

  it('retains every unmet requirement so a reader is not ambushed by a second blocker', () => {
    const r = eliminate([
      { requirement: budget, requirementId: 'req:budget', value: 5000 },
      { requirement: flash, requirementId: 'req:flash_sync', value: 0.02 },
    ]);
    expect(r.allUnmet.map((u) => u.requirement).sort()).toEqual([
      'req:budget',
      'req:flash_sync',
    ]);
  });

  it('treats absent evidence for a hard requirement as maximally binding', () => {
    const r = eliminate([{ requirement: budget, requirementId: 'req:budget', value: null }]);
    expect(r.eliminated).toBe(true);
    expect(r.binding?.margin).toBe(Number.NEGATIVE_INFINITY);
  });

  it('is order-independent', () => {
    const a = eliminate([
      { requirement: budget, requirementId: 'req:budget', value: 5000 },
      { requirement: flash, requirementId: 'req:flash_sync', value: 0.02 },
    ]);
    const b = eliminate([
      { requirement: flash, requirementId: 'req:flash_sync', value: 0.02 },
      { requirement: budget, requirementId: 'req:budget', value: 5000 },
    ]);
    expect(a).toEqual(b);
  });
});
