import type { UnitKey } from './brand.js';

/** JSON-plain by contract. Crosses HTTP, JSONB, Redis, Python and mobile boundaries. */
export interface Quantity {
  readonly value: number;
  readonly unit: UnitKey;
}

export const q = (value: number, unit: UnitKey): Quantity => ({ value, unit });

export const isQuantity = (v: unknown): v is Quantity =>
  typeof v === 'object' && v !== null &&
  typeof (v as Quantity).value === 'number' &&
  typeof (v as Quantity).unit === 'string';
