import type {
  AttributeKey, CapabilityKey, EntityTypeKey, DerivationId, UnitKey, Brand,
} from '@camefa/engine-kernel';
import type { Dimension, Quantity } from '@camefa/engine-kernel';

export type SemVer = Brand<string, 'SemVer'>;
export type ActivityKey = Brand<string, 'ActivityKey'>;
export type RoleKey = Brand<string, 'RoleKey'>;

export interface EntityTypeDefinition {
  readonly key: EntityTypeKey;
  readonly label: string;
  readonly extends?: EntityTypeKey;
  readonly abstract: boolean;
}

export type ValueType =
  | { readonly kind: 'quantity'; readonly dimension: Dimension; readonly canonicalUnit: UnitKey }
  | { readonly kind: 'money' }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'text' }
  | { readonly kind: 'reference'; readonly entityType: EntityTypeKey };

export interface AttributeDefinition {
  readonly key: AttributeKey;
  readonly label: string;
  readonly valueType: ValueType;
  readonly cardinality: 'single' | 'multiple';
  readonly temporality: 'static' | 'temporal';
  readonly appliesTo: readonly EntityTypeKey[];
}

export type CapabilityOutput =
  | { readonly kind: 'quantity'; readonly dimension: Dimension; readonly canonicalUnit: UnitKey }
  | { readonly kind: 'ordinal'; readonly levels: readonly string[] };

export interface CapabilityDefinition {
  readonly key: CapabilityKey;
  readonly label: string;
  readonly output: CapabilityOutput;
  readonly inputs: readonly (AttributeKey | CapabilityKey)[];
  readonly derivation: DerivationId;
  readonly version: SemVer;
  readonly interpretation: 'higher_is_better' | 'lower_is_better' | 'target_range';
  /** Smallest difference a competent user can perceive, in the capability's own units. */
  readonly jnd: Quantity;
  /** Beyond this value additional capability yields no further benefit. */
  readonly saturation?: Quantity;
  readonly appliesTo: readonly EntityTypeKey[];
}

export type Emphasis = 'must' | 'strongly_prefer' | 'prefer' | 'nice_to_have' | 'indifferent';

export type RequirementTarget =
  | { readonly kind: 'quantity'; readonly value: Quantity }
  | { readonly kind: 'ordinal'; readonly level: string };

export interface ImpliedRequirement {
  readonly capability: CapabilityKey;
  readonly op: 'gte' | 'lte' | 'within' | 'maximize' | 'minimize';
  readonly target?: RequirementTarget;
  readonly band?: Quantity;
  readonly emphasis: Emphasis;
  readonly rationale: string;
}

export interface ActivityProfile {
  readonly key: ActivityKey;
  readonly label: string;
  readonly version: SemVer;
  readonly gates: readonly ImpliedRequirement[];
  readonly implies: readonly ImpliedRequirement[];
  readonly roles: readonly RoleKey[];
  readonly aggregationP: number;
}
