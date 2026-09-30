declare const CONTRACT_BRAND: unique symbol;
export type AttributeKey = string & { readonly [CONTRACT_BRAND]: 'AttributeKey' };
export type CapabilityKey = string & { readonly [CONTRACT_BRAND]: 'CapabilityKey' };
export type DerivationId = string & { readonly [CONTRACT_BRAND]: 'DerivationId' };

export const attributeKey = (s: string): AttributeKey => s as AttributeKey;
export const capabilityKey = (s: string): CapabilityKey => s as CapabilityKey;
export const derivationId = (s: string): DerivationId => s as DerivationId;
