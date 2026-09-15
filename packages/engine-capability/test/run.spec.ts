import { describe, expect, it } from 'vitest';
import { CostMeter } from '@camefa/engine-kernel';
import { CAMERA_DERIVATIONS } from '../src/packs/camera.js';
import { DerivationError, topologicalOrder, type Derivation } from '../src/derivation.js';
import { runDerivations, type ResolvedValue } from '../src/run.js';

const input = (attribute: string, value: number, over: Partial<ResolvedValue> = {}): ResolvedValue => ({
  entityId: 'e:1',
  attribute,
  value,
  unit: 'count',
  evidence: [
    {
      claimId: `c:${attribute}`,
      entityId: over.entityId ?? 'e:1',
      attribute,
      sourceId: 'src:a',
      reliability: 0.9,
    },
  ],
  ...over,
});

const chain = (id: string, produces: string, requires: string[]): Derivation => ({
  derivationId: id,
  packId: 'test',
  produces,
  requires,
  unit: 'count',
  rationale: 'test',
  compute: (c) => requires.reduce((s, r) => s + c.value(r), 0),
});

describe('topologicalOrder', () => {
  it('orders producers before consumers', () => {
    const order = topologicalOrder([chain('d2', 'y', ['x']), chain('d1', 'x', ['raw'])]);
    expect(order.map((d) => d.derivationId)).toEqual(['d1', 'd2']);
  });

  it('refuses cycles instead of iterating', () => {
    expect(() => topologicalOrder([chain('d1', 'x', ['y']), chain('d2', 'y', ['x'])])).toThrow(
      /cycle/,
    );
  });

  it('refuses two derivations producing the same attribute', () => {
    expect(() => topologicalOrder([chain('d1', 'x', []), chain('d2', 'x', [])])).toThrow(
      DerivationError,
    );
  });

  it('is deterministic for independent derivations', () => {
    const ds = [chain('b', 'b', []), chain('a', 'a', []), chain('c', 'c', [])];
    expect(topologicalOrder(ds).map((d) => d.derivationId)).toEqual(['a', 'b', 'c']);
  });
});

describe('runDerivations', () => {
  it('computes a derived value with propagated evidence', () => {
    const meter = new CostMeter();
    const r = runDerivations(
      [input('focal_length_max_mm', 400), input('sensor_crop_factor', 1.6)],
      CAMERA_DERIVATIONS,
      meter,
    );
    const reach = r.values.find((v) => v.attribute === 'effective_reach_mm')!;
    expect(reach.value).toBeCloseTo(640, 6);
    expect(reach.evidence.map((e) => e.claimId).sort()).toEqual([
      'c:focal_length_max_mm',
      'c:sensor_crop_factor',
    ]);
    expect(reach.confidence).toBeCloseTo(0.9, 6);
  });

  it('skips a derivation with missing required inputs and reports why', () => {
    const r = runDerivations([input('focal_length_max_mm', 400)], CAMERA_DERIVATIONS, new CostMeter());
    const skip = r.skipped.find((s) => s.derivationId === 'drv:effective_reach_mm')!;
    expect(skip.missing).toEqual(['sensor_crop_factor']);
    expect(r.values.some((v) => v.attribute === 'effective_reach_mm')).toBe(false);
  });

  it('runs with an optional input absent and does not count it as evidence', () => {
    const without = runDerivations(
      [input('dr_stops_base', 12), input('max_aperture_f', 2.8)],
      CAMERA_DERIVATIONS,
      new CostMeter(),
    );
    const v = without.values.find((x) => x.attribute === 'low_light_stops')!;
    expect(v.evidence.map((e) => e.claimId).sort()).toEqual(['c:dr_stops_base', 'c:max_aperture_f']);

    const withIbis = runDerivations(
      [input('dr_stops_base', 12), input('max_aperture_f', 2.8), input('ibis_stops', 5)],
      CAMERA_DERIVATIONS,
      new CostMeter(),
    );
    const v2 = withIbis.values.find((x) => x.attribute === 'low_light_stops')!;
    expect(v2.value).toBeGreaterThan(v.value);
    expect(v2.evidence).toHaveLength(3);
  });

  it('meters one unit per derivation execution', () => {
    const meter = new CostMeter();
    runDerivations(
      [
        input('focal_length_max_mm', 400),
        input('sensor_crop_factor', 1.6),
        input('focal_length_max_mm', 200, { entityId: 'e:2' }),
        input('sensor_crop_factor', 1, { entityId: 'e:2' }),
      ],
      [CAMERA_DERIVATIONS[0]],
      meter,
    );
    expect(meter.spent('derivations')).toBe(2);
  });

  it('records a failure rather than emitting a non-finite value', () => {
    const bad: Derivation = {
      derivationId: 'drv:bad',
      packId: 'test',
      produces: 'nonsense',
      requires: ['x'],
      unit: 'count',
      rationale: 'test',
      compute: (c) => c.value('x') / 0,
    };
    const r = runDerivations([input('x', 0)], [bad], new CostMeter());
    expect(r.values).toHaveLength(0);
    expect(r.failed[0].error).toMatch(/non-finite/);
  });

  it('rejects a derivation reading an undeclared input', () => {
    const sneaky: Derivation = {
      derivationId: 'drv:sneaky',
      packId: 'test',
      produces: 'z',
      requires: ['x'],
      unit: 'count',
      rationale: 'test',
      compute: (c) => c.value('x') + c.value('undeclared'),
    };
    const r = runDerivations([input('x', 1), input('undeclared', 2)], [sneaky], new CostMeter());
    expect(r.failed[0].error).toMatch(/undeclared input/);
  });

  it('chains derived attributes as inputs to later derivations', () => {
    const r = runDerivations(
      [input('raw', 2)],
      [chain('d1', 'x', ['raw']), chain('d2', 'y', ['x'])],
      new CostMeter(),
    );
    expect(r.values.map((v) => v.attribute)).toEqual(['x', 'y']);
    expect(r.values.find((v) => v.attribute === 'y')!.value).toBe(2);
  });

  it('processes entities independently', () => {
    const r = runDerivations(
      [
        input('focal_length_max_mm', 400),
        input('sensor_crop_factor', 1.6),
        input('focal_length_max_mm', 600, { entityId: 'e:2' }),
        input('sensor_crop_factor', 1, { entityId: 'e:2' }),
      ],
      [CAMERA_DERIVATIONS[0]],
      new CostMeter(),
    );
    expect(r.values.map((v) => [v.entityId, v.value])).toEqual([
      ['e:1', 640],
      ['e:2', 600],
    ]);
  });
});
