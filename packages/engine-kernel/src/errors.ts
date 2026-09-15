import type { UnitKey, AttributeKey, CapabilityKey, EntityTypeKey } from './brand.js';

export type KernelError =
  | { readonly code: 'DUPLICATE_UNIT'; readonly key: UnitKey }
  | { readonly code: 'UNKNOWN_UNIT'; readonly key: UnitKey }
  | { readonly code: 'DIMENSION_MISMATCH'; readonly from: UnitKey; readonly to: UnitKey }
  | { readonly code: 'NON_ADDITIVE_UNIT'; readonly key: UnitKey }
  | { readonly code: 'NOT_FINITE'; readonly value: number };

export type OntologyError =
  | KernelError
  | { readonly code: 'DUPLICATE_ATTRIBUTE'; readonly key: AttributeKey }
  | { readonly code: 'DUPLICATE_CAPABILITY'; readonly key: CapabilityKey }
  | { readonly code: 'UNKNOWN_INPUT'; readonly capability: CapabilityKey; readonly input: string }
  | { readonly code: 'CAPABILITY_CYCLE'; readonly members: readonly CapabilityKey[] }
  | { readonly code: 'ENTITY_TYPE_CYCLE'; readonly members: readonly EntityTypeKey[] }
  | { readonly code: 'CANONICAL_UNIT_MISMATCH'; readonly key: string; readonly unit: UnitKey }
  | { readonly code: 'JND_DIMENSION_MISMATCH'; readonly key: CapabilityKey }
  | { readonly code: 'UNKNOWN_ENTITY_TYPE'; readonly key: string };

export const formatError = (e: OntologyError): string =>
  `${e.code}: ${JSON.stringify(e)}`;
