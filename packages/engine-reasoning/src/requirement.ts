import type { CapabilityKey, Quantity, Brand } from '@camefa/engine-kernel';
import type { RequirementTarget, Emphasis, ActivityKey } from '@camefa/engine-ontology';

export type RequirementId = Brand<string, 'RequirementId'>;

export type RequirementOrigin =
  | { readonly kind: 'stated' }
  | { readonly kind: 'observed'; readonly evidence: string }
  | { readonly kind: 'profile'; readonly activity: ActivityKey }
  | { readonly kind: 'default' };

export interface Requirement {
  readonly id: RequirementId;
  readonly capability: CapabilityKey;
  readonly op: 'gte' | 'lte' | 'within' | 'maximize' | 'minimize';
  readonly target?: RequirementTarget;
  readonly band?: Quantity;
  readonly hardness: 'blocking' | 'weighted';
  readonly weight: number;
  readonly origin: RequirementOrigin;
  readonly rationale: string;
}

export interface RequirementSet {
  readonly requirements: readonly Requirement[];
  readonly aggregationP: number;
}

/** Emphasis is a linguistic judgement; magnitude is a calibration decision. */
export const EMPHASIS_WEIGHT: Record<Emphasis, number> = {
  must: 1.0,
  strongly_prefer: 0.75,
  prefer: 0.45,
  nice_to_have: 0.2,
  indifferent: 0,
};

export const expandActivity = (
  profile: { key: ActivityKey; gates: readonly ImpliedLike[]; implies: readonly ImpliedLike[]; aggregationP: number },
): RequirementSet => {
  const build = (r: ImpliedLike, hardness: 'blocking' | 'weighted', i: number): Requirement => ({
    id: `${profile.key}:${hardness}:${i}` as RequirementId,
    capability: r.capability,
    op: r.op,
    ...(r.target !== undefined ? { target: r.target } : {}),
    ...(r.band !== undefined ? { band: r.band } : {}),
    hardness,
    weight: EMPHASIS_WEIGHT[r.emphasis],
    origin: { kind: 'profile', activity: profile.key },
    rationale: r.rationale,
  });
  return {
    requirements: [
      ...profile.gates.map((r, i) => build(r, 'blocking', i)),
      ...profile.implies.map((r, i) => build(r, 'weighted', i)),
    ].filter((r) => r.hardness === 'blocking' || r.weight > 0),
    aggregationP: profile.aggregationP,
  };
};

interface ImpliedLike {
  readonly capability: CapabilityKey;
  readonly op: Requirement['op'];
  readonly target?: RequirementTarget;
  readonly band?: Quantity;
  readonly emphasis: Emphasis;
  readonly rationale: string;
}
