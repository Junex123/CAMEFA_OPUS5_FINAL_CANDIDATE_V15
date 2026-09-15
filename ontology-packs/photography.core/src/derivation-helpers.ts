import { q, unitKey, type AttributeKey, type CapabilityKey } from '@camefa/engine-kernel';
import type {
  CapabilityResult, DerivationStrategy, ResolvedInputs, DerivationContext,
} from '@camefa/engine-capability';

export const value = (n: number, unit: string): CapabilityResult =>
  ({ kind: 'value', value: q(n, unitKey(unit)) });

export const ordinal = (level: string): CapabilityResult =>
  ({ kind: 'value', value: { ordinal: level } });

export const outOfDomain = (detail: string): CapabilityResult =>
  ({ kind: 'unknown', reason: { code: 'OUT_OF_DOMAIN', detail } });

export const strategy = (
  label: 'primary' | 'fallback',
  requires: readonly (AttributeKey | CapabilityKey)[],
  reliability: number,
  emits: DerivationStrategy['emits'],
  compute: (i: ResolvedInputs, c: DerivationContext) => CapabilityResult,
): DerivationStrategy => ({ label, requires, reliability, emits, compute });

export const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Sensor generation uplift, saturating. Historical gain ≈ 0.08 stop/year, capped. */
export const generationUplift = (year: number | undefined): number =>
  year === undefined ? 0 : clamp((year - 2015) * 0.08, -1.2, 1.0);
