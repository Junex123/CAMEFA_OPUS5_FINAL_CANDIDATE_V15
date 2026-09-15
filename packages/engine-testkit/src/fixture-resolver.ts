import { q, unitKey, type AttributeKey, type EntityId, type Quantity } from '@camefa/engine-kernel';
export type EvidenceClass = 'manufacturer' | 'measured' | 'derived' | 'community' | 'unknown';
export type ClaimValue =
  | { readonly kind: 'quantity'; readonly value: Quantity }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'enum'; readonly value: string }
  | { readonly kind: 'text'; readonly value: string };
export interface ResolvedClaim {
  readonly attribute: AttributeKey;
  readonly value: ClaimValue;
  readonly confidence: number;
  readonly evidenceClass: EvidenceClass;
  readonly contributing: readonly string[];
  readonly dissenting: readonly string[];
}
export interface ClaimResolverPort {
  resolve(subject: EntityId, attributes: readonly AttributeKey[]): Promise<ReadonlyMap<AttributeKey, ResolvedClaim>>;
}


export interface FixtureClaim {
  readonly value: ClaimValue;
  readonly evidenceClass: EvidenceClass;
  readonly confidence: number;
  readonly claimId?: string;
  readonly dissenting?: readonly string[];
}

export interface FixtureEntity {
  readonly id: EntityId;
  readonly entityType: string;
  readonly label: string;
  readonly claims: Readonly<Record<string, FixtureClaim>>;
}

export const num = (
  n: number, unit: string, evidenceClass: EvidenceClass = 'manufacturer', confidence = 0.9,
): FixtureClaim => ({ value: { kind: 'quantity', value: q(n, unitKey(unit)) }, evidenceClass, confidence });

export const measured = (n: number, unit: string, confidence = 0.97): FixtureClaim =>
  num(n, unit, 'measured', confidence);

export const bool = (b: boolean, confidence = 0.95): FixtureClaim =>
  ({ value: { kind: 'boolean', value: b }, evidenceClass: 'manufacturer', confidence });

export const enumeration = (s: string, confidence = 0.95): FixtureClaim =>
  ({ value: { kind: 'enum', value: s }, evidenceClass: 'manufacturer', confidence });

export class FixtureClaimResolver implements ClaimResolverPort {
  readonly #entities = new Map<string, FixtureEntity>();
  #calls = 0;

  constructor(entities: readonly FixtureEntity[]) {
    for (const e of entities) this.#entities.set(e.id, e);
  }

  entity(id: EntityId): FixtureEntity | undefined {
    return this.#entities.get(id);
  }

  get callCount(): number {
    return this.#calls;
  }

  async resolve(
    subject: EntityId,
    attributes: readonly AttributeKey[],
  ): Promise<ReadonlyMap<AttributeKey, ResolvedClaim>> {
    this.#calls += 1;
    const entity = this.#entities.get(subject);
    const out = new Map<AttributeKey, ResolvedClaim>();
    if (!entity) return out;
    for (const key of attributes) {
      const claim = entity.claims[key];
      if (!claim) continue;
      out.set(key, {
        attribute: key,
        value: claim.value,
        confidence: claim.confidence,
        evidenceClass: claim.evidenceClass,
        contributing: [claim.claimId ?? `${entity.id}:${key}`],
        dissenting: claim.dissenting ?? [],
      });
    }
    return out;
  }
}
