import type { AttributeKey, EntityId, Quantity } from '@camefa/engine-kernel';
import type { Money } from '@camefa/engine-kernel';

export type EvidenceClass = 'measured' | 'manufacturer' | 'community' | 'stated' | 'inferred';

export type ClaimValue =
  | { readonly kind: 'quantity'; readonly value: Quantity }
  | { readonly kind: 'money'; readonly value: Money }
  | { readonly kind: 'enum'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'reference'; readonly value: EntityId };

export interface ResolvedClaim {
  readonly attribute: AttributeKey;
  readonly value: ClaimValue;
  readonly confidence: number;
  readonly evidenceClass: EvidenceClass;
  readonly contributing: readonly string[];
  readonly dissenting: readonly string[];
}

/** Dependency inversion: capability layer never imports the ledger implementation. */
export interface ClaimResolverPort {
  resolve(
    subject: EntityId,
    attributes: readonly AttributeKey[],
    opts: { readonly validAt?: string; readonly knownAt?: string; readonly policy?: string },
  ): Promise<ReadonlyMap<AttributeKey, ResolvedClaim>>;
}

export interface CapabilityCachePort {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}
