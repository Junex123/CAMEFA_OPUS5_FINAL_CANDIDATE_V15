import { type UnitRegistry, type Quantity } from '@camefa/engine-kernel';
import type { CapabilityDefinition } from '@camefa/engine-ontology';
import type { CapabilityResult } from '@camefa/engine-capability';
import type { Requirement } from './requirement.js';

export type Verdict = 'satisfied' | 'violated' | 'indeterminate';

type QuantityCapability = CapabilityDefinition & { readonly output: Extract<CapabilityDefinition['output'], { readonly kind: 'quantity' }> };
type OrdinalCapability = CapabilityDefinition & { readonly output: Extract<CapabilityDefinition['output'], { readonly kind: 'ordinal' }> };

export interface SatisfactionOutcome {
  readonly verdict: Verdict;
  readonly satisfaction: number;
  readonly deltaJnd: number | null;
  readonly note?: 'saturated' | 'no_target' | 'unmeasurable';
}

const LOGISTIC_STEEPNESS = 0.9;
const MIDPOINT_JND = -1;
const logistic = (x: number) => 1 / (1 + Math.exp(-LOGISTIC_STEEPNESS * (x - MIDPOINT_JND)));

export const satisfactionOf = (
  result: CapabilityResult,
  req: Requirement,
  def: CapabilityDefinition,
  units: UnitRegistry,
  field?: { readonly min: number; readonly max: number },
): SatisfactionOutcome => {
  if (result.kind === 'unknown') return { verdict: 'indeterminate', satisfaction: 0.5, deltaJnd: null, note: 'unmeasurable' };
  if (def.output.kind === 'ordinal') return ordinalSatisfaction(result, req, def);
  const actual = result.value as Quantity;
  const canonical = def.output.canonicalUnit;
  const jnd = units.convert(def.output.jnd, canonical);
  if (!jnd.ok || jnd.value.value <= 0) return { verdict: 'indeterminate', satisfaction: 0.5, deltaJnd: null, note: 'unmeasurable' };
  const better = def.interpretation === 'lower_is_better' ? -1 : 1;
  const quantityDef = def as QuantityCapability;
  const effective = applySaturation(actual, quantityDef, units);
  if (req.op === 'maximize' || req.op === 'minimize') return relativeSatisfaction(effective, quantityDef, units, field, req.op);
  if (req.target?.kind !== 'quantity') return { verdict: 'indeterminate', satisfaction: 0.5, deltaJnd: null, note: 'no_target' };
  const raw = units.deltaIn(effective, req.target.value, canonical);
  if (!raw.ok) return { verdict: 'indeterminate', satisfaction: 0.5, deltaJnd: null, note: 'unmeasurable' };
  const directional = req.op === 'lte' ? -raw.value : raw.value;
  const deltaJnd = directional / jnd.value.value;
  if (req.op === 'within') {
    const band = req.band ? units.convert(req.band, canonical) : null;
    const width = band && band.ok ? band.value.value / jnd.value.value : 1;
    const inside = Math.abs(deltaJnd) <= width;
    return { verdict: inside ? 'satisfied' : 'violated', satisfaction: Math.exp(-Math.pow(Math.abs(deltaJnd) / Math.max(width, 1e-6), 2)), deltaJnd };
  }
  const strict = units.deltaIn(actual, req.target.value, canonical);
  const strictDirectional = !strict.ok ? 0 : req.op === 'lte' ? -strict.value : strict.value;
  return {
    verdict: strictDirectional >= 0 ? 'satisfied' : 'violated',
    satisfaction: logistic(deltaJnd),
    deltaJnd,
    ...(isSaturated(actual, quantityDef, units, better) ? { note: 'saturated' as const } : {}),
  };
};

const applySaturation = (actual: Quantity, def: QuantityCapability, units: UnitRegistry): Quantity => {
  const sat = def.saturation;
  if (!sat) return actual;
  const cmp = units.compare(actual, sat);
  if (!cmp.ok) return actual;
  const lowerBetter = def.interpretation === 'lower_is_better';
  const beyond = lowerBetter ? cmp.value < 0 : cmp.value > 0;
  return beyond ? sat : actual;
};

const isSaturated = (actual: Quantity, def: QuantityCapability, units: UnitRegistry, better: number): boolean => {
  const sat = def.saturation;
  if (!sat) return false;
  const cmp = units.compare(actual, sat);
  return cmp.ok && cmp.value === (better > 0 ? 1 : -1);
};

const relativeSatisfaction = (actual: Quantity, def: QuantityCapability, units: UnitRegistry, field: { min: number; max: number } | undefined, op: 'maximize' | 'minimize'): SatisfactionOutcome => {
  const canonical = def.output.canonicalUnit;
  const a = units.convert(actual, canonical);
  if (!a.ok) return { verdict: 'indeterminate', satisfaction: 0.5, deltaJnd: null, note: 'unmeasurable' };
  if (!field || field.max === field.min) return { verdict: 'satisfied', satisfaction: 0.5, deltaJnd: null, note: 'no_target' };
  const norm = (a.value.value - field.min) / (field.max - field.min);
  const s = op === 'maximize' ? norm : 1 - norm;
  return { verdict: 'satisfied', satisfaction: clamp01(s), deltaJnd: null };
};

const ordinalSatisfaction = (result: Extract<CapabilityResult, { kind: 'value' }>, req: Requirement, def: OrdinalCapability): SatisfactionOutcome => {
  const levels = def.output.levels;
  const actualLevel = (result.value as { ordinal: string }).ordinal;
  const ai = levels.indexOf(actualLevel);
  if (ai < 0) return { verdict: 'indeterminate', satisfaction: 0.5, deltaJnd: null, note: 'unmeasurable' };
  if (req.target?.kind !== 'ordinal') return { verdict: 'indeterminate', satisfaction: 0.5, deltaJnd: null, note: 'no_target' };
  const ti = levels.indexOf(req.target.level);
  if (ti < 0) return { verdict: 'indeterminate', satisfaction: 0.5, deltaJnd: null, note: 'no_target' };
  const raw = ai - ti;
  const directional = req.op === 'lte' ? -raw : raw;
  return { verdict: directional >= 0 ? 'satisfied' : 'violated', satisfaction: logistic(directional), deltaJnd: directional };
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
