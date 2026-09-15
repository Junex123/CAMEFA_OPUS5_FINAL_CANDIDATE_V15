import { type Result, ok, err } from './result.js';
import type { UnitKey } from './brand.js';
import type { UnitDefinition } from './unit.js';
import type { Quantity } from './quantity.js';
import type { KernelError } from './errors.js';
import { dimEquals, type Dimension } from './dimension.js';

export class UnitRegistry {
  readonly #units = new Map<string, UnitDefinition>();

  register(def: UnitDefinition): Result<void, KernelError> {
    if (this.#units.has(def.key)) return err({ code: 'DUPLICATE_UNIT', key: def.key });
    this.#units.set(def.key, def);
    return ok(undefined);
  }

  registerAll(defs: readonly UnitDefinition[]): Result<void, KernelError> {
    for (const d of defs) {
      const r = this.register(d);
      if (!r.ok) return r;
    }
    return ok(undefined);
  }

  get(key: UnitKey): UnitDefinition | undefined {
    return this.#units.get(key);
  }

  has(key: UnitKey): boolean {
    return this.#units.has(key);
  }

  dimensionOf(key: UnitKey): Result<Dimension, KernelError> {
    const u = this.#units.get(key);
    return u ? ok(u.dimension) : err({ code: 'UNKNOWN_UNIT', key });
  }

  toCanonical(qty: Quantity): Result<number, KernelError> {
    const u = this.#units.get(qty.unit);
    if (!u) return err({ code: 'UNKNOWN_UNIT', key: qty.unit });
    if (!Number.isFinite(qty.value)) return err({ code: 'NOT_FINITE', value: qty.value });
    return ok(u.toCanonical(qty.value));
  }

  convert(qty: Quantity, to: UnitKey): Result<Quantity, KernelError> {
    const from = this.#units.get(qty.unit);
    if (!from) return err({ code: 'UNKNOWN_UNIT', key: qty.unit });
    const target = this.#units.get(to);
    if (!target) return err({ code: 'UNKNOWN_UNIT', key: to });
    if (!dimEquals(from.dimension, target.dimension)) {
      return err({ code: 'DIMENSION_MISMATCH', from: from.key, to: target.key });
    }
    if (!Number.isFinite(qty.value)) return err({ code: 'NOT_FINITE', value: qty.value });
    return ok({ value: target.fromCanonical(from.toCanonical(qty.value)), unit: to });
  }

  add(a: Quantity, b: Quantity): Result<Quantity, KernelError> {
    const ua = this.#units.get(a.unit);
    if (!ua) return err({ code: 'UNKNOWN_UNIT', key: a.unit });
    if (!ua.additive) return err({ code: 'NON_ADDITIVE_UNIT', key: a.unit });
    const conv = this.convert(b, a.unit);
    if (!conv.ok) return conv;
    return ok({ value: a.value + conv.value.value, unit: a.unit });
  }

  subtract(a: Quantity, b: Quantity): Result<Quantity, KernelError> {
    const ua = this.#units.get(a.unit);
    if (!ua) return err({ code: 'UNKNOWN_UNIT', key: a.unit });
    if (!ua.additive) return err({ code: 'NON_ADDITIVE_UNIT', key: a.unit });
    const conv = this.convert(b, a.unit);
    if (!conv.ok) return conv;
    return ok({ value: a.value - conv.value.value, unit: a.unit });
  }

  /** Signed difference a - b in the requested unit. Log units are handled in their own scale. */
  deltaIn(a: Quantity, b: Quantity, unit: UnitKey): Result<number, KernelError> {
    const ca = this.convert(a, unit);
    if (!ca.ok) return ca;
    const cb = this.convert(b, unit);
    if (!cb.ok) return cb;
    return ok(ca.value.value - cb.value.value);
  }

  compare(a: Quantity, b: Quantity): Result<-1 | 0 | 1, KernelError> {
    const ca = this.toCanonical(a);
    if (!ca.ok) return ca;
    const cb = this.toCanonical(b);
    if (!cb.ok) return cb;
    const d = ca.value - cb.value;
    return ok(d < 0 ? -1 : d > 0 ? 1 : 0);
  }

  keys(): readonly UnitKey[] {
    return [...this.#units.keys()] as UnitKey[];
  }
}

export const unitFingerprintOf = (u: UnitDefinition): string =>
  JSON.stringify({
    key: u.key,
    label: u.label,
    dimension: u.dimension,
    scale: u.scale,
    additive: u.additive,
    zero: u.toCanonical(0),
    one: u.toCanonical(1),
  });
