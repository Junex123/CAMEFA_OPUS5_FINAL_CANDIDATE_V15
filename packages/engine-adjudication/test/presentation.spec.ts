import { describe, expect, it } from 'vitest';
import { presentBlind } from '../src/presentation.js';
import type { ClaimView } from '../src/conflict.js';

const claim = (claimId: string, sourceId: string, value: number): ClaimView => ({
  claimId,
  entityId: 'e:1',
  attribute: 'weight_g',
  value,
  unit: 'g',
  sourceId,
  precision: 0,
  approximate: false,
  reliabilityAtRead: sourceId === 'src:mfr' ? 0.95 : 0.4,
  observedAt: '2026-01-01T00:00:00.000Z',
  outlierFlags: [],
});

const claims = [
  claim('c:1', 'src:mfr', 670),
  claim('c:2', 'src:blog', 690),
  claim('c:3', 'src:retail', 675),
];

describe('presentBlind', () => {
  it('withholds source identity and reliability entirely', () => {
    const json = JSON.stringify(presentBlind('conf:1', 'E1', 'weight_g', claims, 5));
    expect(json).not.toContain('src:mfr');
    expect(json).not.toContain('0.95');
    expect(json).not.toContain('observedAt');
  });

  it('is stable across calls so a reviewer can refer to an option', () => {
    const a = presentBlind('conf:1', 'E1', 'weight_g', claims, 5);
    const b = presentBlind('conf:1', 'E1', 'weight_g', [...claims].reverse(), 5);
    expect(a.options).toEqual(b.options);
  });

  it('orders differently for different conflicts', () => {
    const a = presentBlind('conf:1', 'E1', 'weight_g', claims, 5).options.map((o) => o.claimId);
    const b = presentBlind('conf:2', 'E1', 'weight_g', claims, 5).options.map((o) => o.claimId);
    expect(a).not.toEqual(b);
  });

  it('retains the epistemic signals a reviewer legitimately needs', () => {
    const p = presentBlind('conf:1', 'E1', 'weight_g', claims, 5);
    expect(p.options[0]).toHaveProperty('precision');
    expect(p.options[0]).toHaveProperty('outlierFlags');
    expect(p.jndThreshold).toBe(5);
  });

  it('labels every option uniquely', () => {
    const labels = presentBlind('conf:1', 'E1', 'weight_g', claims, 5).options.map((o) => o.optionLabel);
    expect(new Set(labels).size).toBe(3);
  });
});
