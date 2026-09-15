export type Dimension =
  | 'mass'
  | 'length'
  | 'time'
  | 'angle'
  | 'currency'
  | 'count'
  | 'ratio'
  | 'stops'
  | 'dimensionless';

export interface UnitDef {
  unit: string;
  dimension: Dimension;
  /** Multiplier to the dimension's canonical unit. */
  toCanonical: number;
}

export const UNITS: Readonly<Record<string, UnitDef>> = {
  g: { unit: 'g', dimension: 'mass', toCanonical: 1 },
  kg: { unit: 'kg', dimension: 'mass', toCanonical: 1000 },
  mm: { unit: 'mm', dimension: 'length', toCanonical: 1 },
  cm: { unit: 'cm', dimension: 'length', toCanonical: 10 },
  s: { unit: 's', dimension: 'time', toCanonical: 1 },
  ms: { unit: 'ms', dimension: 'time', toCanonical: 0.001 },
  deg: { unit: 'deg', dimension: 'angle', toCanonical: 1 },
  usd: { unit: 'usd', dimension: 'currency', toCanonical: 1 },
  count: { unit: 'count', dimension: 'count', toCanonical: 1 },
  fps: { unit: 'fps', dimension: 'ratio', toCanonical: 1 },
  ratio: { unit: 'ratio', dimension: 'ratio', toCanonical: 1 },
  stops: { unit: 'stops', dimension: 'stops', toCanonical: 1 },
  score: { unit: 'score', dimension: 'dimensionless', toCanonical: 1 },
};

export class UnitError extends Error {}

export function unitDef(unit: string): UnitDef {
  const def = UNITS[unit];
  if (!def) throw new UnitError(`unknown unit "${unit}"`);
  return def;
}

export function sameDimension(a: string, b: string): boolean {
  return unitDef(a).dimension === unitDef(b).dimension;
}

export function convert(value: number, from: string, to: string): number {
  const f = unitDef(from);
  const t = unitDef(to);
  if (f.dimension !== t.dimension) {
    throw new UnitError(`cannot convert ${from} (${f.dimension}) to ${to} (${t.dimension})`);
  }
  return (value * f.toCanonical) / t.toCanonical;
}
