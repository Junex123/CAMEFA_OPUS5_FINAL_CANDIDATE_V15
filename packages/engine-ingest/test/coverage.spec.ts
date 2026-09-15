import { describe, expect, it } from 'vitest';
import { assessCoverage } from '../src/coverage.js';

const entities = ['e:1', 'e:2', 'e:3', 'e:4'];
const req = [
  { attribute: 'weight_g', minEntityFraction: 0.9, minCorroboratedFraction: 0.5 },
  { attribute: 'dr_stops_base', minEntityFraction: 0.5, minCorroboratedFraction: 0 },
];

describe('assessCoverage', () => {
  it('counts corroboration by distinct source, not claim volume', () => {
    const claims = [
      { entityId: 'e:1', attribute: 'weight_g', sourceId: 'src:a' },
      { entityId: 'e:1', attribute: 'weight_g', sourceId: 'src:a' },
      { entityId: 'e:2', attribute: 'weight_g', sourceId: 'src:a' },
      { entityId: 'e:2', attribute: 'weight_g', sourceId: 'src:b' },
    ];
    const row = assessCoverage('ep:1', entities, claims, req, new Set()).rows.find(
      (r) => r.attribute === 'weight_g',
    )!;
    expect(row).toMatchObject({ covered: 2, corroborated: 1 });
  });

  it('reports insufficient when any requirement is unmet', () => {
    const report = assessCoverage('ep:1', entities, [], req, new Set());
    expect(report.verdict).toBe('insufficient');
  });

  it('lists attributes that anchor-eligible sources can seed', () => {
    const report = assessCoverage(
      'ep:1',
      entities,
      [{ entityId: 'e:1', attribute: 'dr_stops_base', sourceId: 'src:lab.dxo' }],
      req,
      new Set(['src:lab.dxo']),
    );
    expect(report.anchorableAttributes).toEqual(['dr_stops_base']);
  });
});
