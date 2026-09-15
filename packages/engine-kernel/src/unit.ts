import type { Dimension } from './dimension.js';
import { type UnitKey, unitKey } from './brand.js';

export type UnitScale = 'linear' | 'affine' | 'logarithmic';

export interface UnitDefinition {
  readonly key: UnitKey;
  readonly label: string;
  readonly dimension: Dimension;
  readonly scale: UnitScale;
  /** Arithmetic addition is physically meaningful. False for log/affine units. */
  readonly additive: boolean;
  readonly toCanonical: (v: number) => number;
  readonly fromCanonical: (v: number) => number;
}

export const linearUnit = (
  key: string, label: string, dimension: Dimension, factor: number,
): UnitDefinition => {
  if (!Number.isFinite(factor) || factor === 0) {
    throw new RangeError(`linearUnit(${key}): factor must be finite and non-zero`);
  }
  return {
    key: unitKey(key), label, dimension, scale: 'linear', additive: true,
    toCanonical: (v) => v * factor,
    fromCanonical: (v) => v / factor,
  };
};

export const affineUnit = (
  key: string, label: string, dimension: Dimension, factor: number, offset: number,
): UnitDefinition => ({
  key: unitKey(key), label, dimension, scale: 'affine', additive: false,
  toCanonical: (v) => v * factor + offset,
  fromCanonical: (v) => (v - offset) / factor,
});

/** Canonical form is the underlying linear ratio: canonical = base^v */
export const logUnit = (
  key: string, label: string, dimension: Dimension, base: number,
): UnitDefinition => ({
  key: unitKey(key), label, dimension, scale: 'logarithmic', additive: false,
  toCanonical: (v) => Math.pow(base, v),
  fromCanonical: (v) => Math.log(v) / Math.log(base),
});
