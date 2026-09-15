declare const BRAND: unique symbol;
export type Brand<T, B extends string> = T & { readonly [BRAND]: B };

export type EntityId = Brand<string, 'EntityId'>;
export type ClaimId = Brand<string, 'ClaimId'>;
export type SourceId = Brand<string, 'SourceId'>;

export const entityId = (s: string): EntityId => s as EntityId;
export const claimId = (s: string): ClaimId => s as ClaimId;
export const sourceId = (s: string): SourceId => s as SourceId;

export type UnitKey = Brand<string, 'UnitKey'>;
export type AttributeKey = Brand<string, 'AttributeKey'>;
export type CapabilityKey = Brand<string, 'CapabilityKey'>;
export type EntityTypeKey = Brand<string, 'EntityTypeKey'>;
export type DerivationId = Brand<string, 'DerivationId'>;
export type PackId = Brand<string, 'PackId'>;
export type Fingerprint = Brand<string, 'Fingerprint'>;

export const unitKey = (s: string): UnitKey => s as UnitKey;
export const attributeKey = (s: string): AttributeKey => s as AttributeKey;
export const capabilityKey = (s: string): CapabilityKey => s as CapabilityKey;
export const entityTypeKey = (s: string): EntityTypeKey => s as EntityTypeKey;
export const derivationId = (s: string): DerivationId => s as DerivationId;
export const packId = (s: string): PackId => s as PackId;
