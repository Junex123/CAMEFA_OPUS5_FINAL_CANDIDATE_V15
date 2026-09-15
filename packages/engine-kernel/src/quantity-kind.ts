import type { Brand } from './brand.js';

export type QuantityKind = Brand<string, 'QuantityKind'>;
const k = (s: string): QuantityKind => s as QuantityKind;

export const K = {
  length: k('length'),
  area: k('area'),
  mass: k('mass'),
  time: k('time'),
  angle: k('angle'),
  information: k('information'),
  bitrate: k('bitrate'),
  energy: k('energy'),
  temperature: k('temperature'),
  illuminance: k('illuminance'),
  frequency: k('frequency'),
  charge: k('charge'),
  /** Plain cardinal counts. MP is a scaled count and interconverts. */
  count: k('count'),
  /** Unit-interval fractions. percent and ratio interconvert. */
  fraction: k('fraction'),
  /** Log2 ratio of a quantity to itself. NOT interchangeable with ev. */
  stop: k('stop'),
  /** Absolute exposure value scale. NOT interchangeable with stop. */
  ev: k('ev'),
} as const;
