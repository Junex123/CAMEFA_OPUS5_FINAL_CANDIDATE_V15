import { describe, it, expect } from 'vitest';
import {
  UnitRegistry, linearUnit, logUnit, D, unitKey, q, isOk,
} from '../src/index.js';

const registry = (): UnitRegistry => {
  const r = new UnitRegistry();
  r.registerAll([
    linearUnit('m', 'metre', D.length, 1),
    linearUnit('mm', 'millimetre', D.length, 0.001),
    linearUnit('g', 'gram', D.mass, 0.001),
    logUnit('stop', 'stop', D.dimensionless, 2),
  ]);
  return r;
};

describe('UnitRegistry', () => {
  it('converts within a dimension', () => {
    const r = registry().convert(q(1500, unitKey('mm')), unitKey('m'));
    expect(isOk(r) && r.value.value).toBeCloseTo(1.5);
  });

  it('rejects cross-dimension conversion', () => {
    const r = registry().convert(q(1, unitKey('g')), unitKey('m'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('DIMENSION_MISMATCH');
  });

  it('refuses to add logarithmic units', () => {
    const r = registry().add(q(1, unitKey('stop')), q(1, unitKey('stop')));
    expect(!r.ok && r.error.code).toBe('NON_ADDITIVE_UNIT');
  });

  it('compares log units by underlying ratio', () => {
    const r = registry().compare(q(3, unitKey('stop')), q(2, unitKey('stop')));
    expect(isOk(r) && r.value).toBe(1);
  });

  it('round-trips log conversion', () => {
    const reg = registry();
    const canonical = reg.toCanonical(q(3, unitKey('stop')));
    expect(isOk(canonical) && canonical.value).toBeCloseTo(8);
  });
});
