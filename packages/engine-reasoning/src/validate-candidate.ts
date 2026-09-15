import {
  unitKey, capabilityKey, type UnitRegistry, type CapabilityKey,
} from '@camefa/engine-kernel';
import type { CompiledOntology, RequirementTarget, Emphasis } from '@camefa/engine-ontology';
import type { CandidateRequirement } from './schema.js';

export type Rejection =
  | { readonly reason: 'UNKNOWN_CAPABILITY'; readonly raw: CandidateRequirement }
  | { readonly reason: 'UNKNOWN_UNIT'; readonly raw: CandidateRequirement }
  | { readonly reason: 'KIND_MISMATCH'; readonly raw: CandidateRequirement }
  | { readonly reason: 'INVALID_OP'; readonly raw: CandidateRequirement }
  | { readonly reason: 'INVALID_LEVEL'; readonly raw: CandidateRequirement }
  | { readonly reason: 'MISSING_TARGET'; readonly raw: CandidateRequirement }
  | { readonly reason: 'INVALID_EMPHASIS'; readonly raw: CandidateRequirement };

export interface ValidatedCandidate {
  readonly capability: CapabilityKey;
  readonly op: 'gte' | 'lte' | 'within' | 'maximize' | 'minimize';
  readonly target?: RequirementTarget;
  readonly emphasis: Emphasis;
}

const OPS = ['gte', 'lte', 'within', 'maximize', 'minimize'] as const;
const EMPHASES = ['must', 'strongly_prefer', 'prefer', 'nice_to_have', 'indifferent'] as const;

/** Invalid candidates are discarded, never coerced to the nearest match. */
export const validateCandidate = (
  raw: CandidateRequirement,
  ont: CompiledOntology,
): { ok: true; value: ValidatedCandidate } | { ok: false; error: Rejection } => {
  const def = ont.capabilities.get(capabilityKey(raw.capability));
  if (!def) return { ok: false, error: { reason: 'UNKNOWN_CAPABILITY', raw } };

  if (!(OPS as readonly string[]).includes(raw.op)) {
    return { ok: false, error: { reason: 'INVALID_OP', raw } };
  }
  if (!(EMPHASES as readonly string[]).includes(raw.emphasis)) {
    return { ok: false, error: { reason: 'INVALID_EMPHASIS', raw } };
  }
  const op = raw.op as ValidatedCandidate['op'];
  const emphasis = raw.emphasis as Emphasis;

  if (op === 'maximize' || op === 'minimize') {
    return { ok: true, value: { capability: def.key, op, emphasis } };
  }

  if (def.output.kind === 'ordinal') {
    if (raw.level === undefined) return { ok: false, error: { reason: 'MISSING_TARGET', raw } };
    if (!def.output.levels.includes(raw.level)) {
      return { ok: false, error: { reason: 'INVALID_LEVEL', raw } };
    }
    return {
      ok: true,
      value: { capability: def.key, op, emphasis, target: { kind: 'ordinal', level: raw.level } },
    };
  }

  if (raw.value === undefined || raw.unit === undefined) {
    return { ok: false, error: { reason: 'MISSING_TARGET', raw } };
  }
  const unit = unitKey(raw.unit);
  const kind = ont.units.kindOf(unit);
  if (!kind.ok) return { ok: false, error: { reason: 'UNKNOWN_UNIT', raw } };
  if (kind.value !== def.output.quantityKind) {
    return { ok: false, error: { reason: 'KIND_MISMATCH', raw } };
  }
  return {
    ok: true,
    value: {
      capability: def.key, op, emphasis,
      target: { kind: 'quantity', value: { value: raw.value, unit } },
    },
  };
};
