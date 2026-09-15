import {
  sha256, type CapabilityKey, type AttributeKey, type EntityId, type Quantity,
} from '@camefa/engine-kernel';
import type { CompiledOntology } from '@camefa/engine-ontology';
import type { ClaimResolverPort, CapabilityCachePort, ResolvedClaim, EvidenceClass } from './ports.js';
import type { LineageNode } from './lineage.js';
import {
  type Derivation, type DerivationRegistry, type CapabilityResult, type ResolvedInputs,
} from './derivation.js';

export interface CapabilityValue {
  readonly capability: CapabilityKey;
  readonly subject: EntityId;
  readonly result: CapabilityResult;
  readonly confidence: number;
  readonly evidenceClass: EvidenceClass;
  readonly lineage: LineageNode;
  readonly cacheKey: string;
  readonly derivationVersion: string;
}

export interface DeriveOptions {
  readonly validAt?: string;
  readonly knownAt?: string;
  readonly policy?: string;
}

export class CapabilityRunner {
  constructor(
    private readonly ontology: CompiledOntology,
    private readonly derivations: DerivationRegistry,
    private readonly claims: ClaimResolverPort,
    private readonly cache: CapabilityCachePort,
  ) {}

  async derive(
    subject: EntityId,
    entityType: string,
    requested: readonly CapabilityKey[],
    opts: DeriveOptions = {},
  ): Promise<ReadonlyMap<CapabilityKey, CapabilityValue>> {
    const needed = this.#closure(requested);
    const ordered = this.ontology.topology.filter((k) => needed.has(k));

    const attributeKeys = new Set<AttributeKey>();
    for (const key of ordered) {
      const def = this.ontology.capabilities.get(key);
      if (!def) continue;
      for (const input of def.inputs) {
        if (this.ontology.attributes.has(input as AttributeKey)) {
          attributeKeys.add(input as AttributeKey);
        }
      }
    }

    const claims = await this.claims.resolve(subject, [...attributeKeys].sort(), opts);
    const out = new Map<CapabilityKey, CapabilityValue>();

    for (const key of ordered) {
      const def = this.ontology.capabilities.get(key);
      if (!def) continue;

      const applicable = def.appliesTo.some((t) => this.ontology.isA(entityType as never, t));
      if (!applicable) {
        out.set(key, this.#notApplicable(subject, key, entityType, def.version));
        continue;
      }

      const derivation = this.derivations.get(def.derivation);
      if (!derivation) {
        out.set(key, this.#unknown(subject, key, def.version, {
          code: 'MISSING_INPUT', input: String(def.derivation),
        }));
        continue;
      }

      const value = await this.#runOne(subject, entityType, derivation, def.inputs, claims, out, opts);
      out.set(key, value);
    }

    const result = new Map<CapabilityKey, CapabilityValue>();
    for (const key of requested) {
      const v = out.get(key);
      if (v) result.set(key, v);
    }
    return result;
  }

  #closure(requested: readonly CapabilityKey[]): ReadonlySet<CapabilityKey> {
    const seen = new Set<CapabilityKey>();
    const stack = [...requested];
    while (stack.length > 0) {
      const key = stack.pop()!;
      if (seen.has(key)) continue;
      seen.add(key);
      const def = this.ontology.capabilities.get(key);
      if (!def) continue;
      for (const input of def.inputs) {
        if (this.ontology.capabilities.has(input as CapabilityKey)) {
          stack.push(input as CapabilityKey);
        }
      }
    }
    return seen;
  }

  async #runOne(
    subject: EntityId,
    entityType: string,
    derivation: Derivation,
    inputKeys: readonly (AttributeKey | CapabilityKey)[],
    claims: ReadonlyMap<AttributeKey, ResolvedClaim>,
    computed: ReadonlyMap<CapabilityKey, CapabilityValue>,
    opts: DeriveOptions,
  ): Promise<CapabilityValue> {
    const inputLineage: LineageNode[] = [];
    const contributingIds: string[] = [];
    const confidences: number[] = [];

    for (const key of inputKeys) {
      const claim = claims.get(key as AttributeKey);
      if (claim) {
        inputLineage.push({
          kind: 'claim',
          attribute: claim.attribute,
          evidenceClass: claim.evidenceClass,
          confidence: claim.confidence,
          contributing: claim.contributing,
          dissenting: claim.dissenting,
        });
        contributingIds.push(...claim.contributing);
        confidences.push(claim.confidence);
        continue;
      }
      const upstream = computed.get(key as CapabilityKey);
      if (upstream) {
        inputLineage.push(upstream.lineage);
        contributingIds.push(...upstream.lineage.kind === 'claim'
          ? upstream.lineage.contributing
          : []);
        confidences.push(upstream.confidence);
      }
    }

    const cacheKey = sha256({
      subject,
      capability: derivation.capability,
      derivation: derivation.id,
      derivationVersion: derivation.version,
      ontology: this.ontology.fingerprint,
      policy: opts.policy ?? 'default',
      validAt: opts.validAt ?? null,
      claims: [...new Set(contributingIds)].sort(),
    });

    const cached = await this.cache.get(cacheKey);
    if (cached !== undefined) return cached as CapabilityValue;

    const inputs = this.#buildInputs(claims, computed);
    const ctx = { ontology: this.ontology, units: this.ontology.units, entityType };

    let chosen: CapabilityValue | null = null;

    for (const strategy of derivation.strategies) {
      const missing = strategy.requires.find((k) => !inputs.has(k));
      if (missing !== undefined) continue;

      const upstreamUnknown = strategy.requires
        .map((k) => inputs.capability(k as CapabilityKey))
        .find((r) => r?.kind === 'unknown');
      if (upstreamUnknown) continue;

      const result = strategy.compute(inputs, ctx);
      if (result.kind === 'unknown') continue;

      const relevant = strategy.requires.map((k) => inputs.confidenceOf(k));
      const combined = combineConfidence(derivation.confidenceCombinator, relevant) * strategy.reliability;

      const inherited = strategy.requires
        .map((k) => inputs.evidenceOf(k))
        .filter((e): e is EvidenceClass => e !== undefined);

      chosen = {
        capability: derivation.capability,
        subject,
        result,
        confidence: clamp01(combined),
        evidenceClass: strategy.emits === 'inherit' ? weakest(inherited) : strategy.emits,
        lineage: {
          kind: 'derivation',
          capability: derivation.capability,
          derivation: derivation.id,
          version: derivation.version,
          strategy: strategy.label,
          confidence: clamp01(combined),
          inputs: inputLineage,
        },
        cacheKey,
        derivationVersion: derivation.version,
      };
      break;
    }

    const value = chosen ?? {
      capability: derivation.capability,
      subject,
      result: {
        kind: 'unknown',
        reason: { code: 'MISSING_INPUT', input: String(derivation.capability) },
      } satisfies CapabilityResult,
      confidence: 0,
      evidenceClass: 'inferred' as EvidenceClass,
      lineage: {
        kind: 'derivation',
        capability: derivation.capability,
        derivation: derivation.id,
        version: derivation.version,
        strategy: 'primary',
        confidence: 0,
        inputs: inputLineage,
      },
      cacheKey,
      derivationVersion: derivation.version,
    };

    await this.cache.set(cacheKey, value);
    return value;
  }

  #buildInputs(
    claims: ReadonlyMap<AttributeKey, ResolvedClaim>,
    computed: ReadonlyMap<CapabilityKey, CapabilityValue>,
  ): ResolvedInputs {
    const val = (k: AttributeKey) => claims.get(k)?.value;
    return {
      attribute: val,
      quantity: (k) => {
        const v = val(k);
        return v?.kind === 'quantity' ? v.value : undefined;
      },
      number: (k) => {
        const v = val(k);
        return v?.kind === 'quantity' ? v.value.value : undefined;
      },
      boolean: (k) => {
        const v = val(k);
        return v?.kind === 'boolean' ? v.value : undefined;
      },
      enumValue: (k) => {
        const v = val(k);
        return v?.kind === 'enum' ? v.value : undefined;
      },
      capability: (k) => computed.get(k)?.result,
      confidenceOf: (k) =>
        claims.get(k as AttributeKey)?.confidence ??
        computed.get(k as CapabilityKey)?.confidence ??
        0,
      evidenceOf: (k) =>
        claims.get(k as AttributeKey)?.evidenceClass ??
        computed.get(k as CapabilityKey)?.evidenceClass,
      has: (k) => claims.has(k as AttributeKey) || computed.has(k as CapabilityKey),
    };
  }

  #unknown(
    subject: EntityId, capability: CapabilityKey, version: string,
    reason: Extract<CapabilityResult, { kind: 'unknown' }>['reason'],
  ): CapabilityValue {
    return {
      capability, subject,
      result: { kind: 'unknown', reason },
      confidence: 0,
      evidenceClass: 'inferred',
      lineage: {
        kind: 'derivation', capability, derivation: 'unregistered' as never,
        version, strategy: 'primary', confidence: 0, inputs: [],
      },
      cacheKey: '',
      derivationVersion: version,
    };
  }

  #notApplicable(
    subject: EntityId, capability: CapabilityKey, entityType: string, version: string,
  ): CapabilityValue {
    return this.#unknown(subject, capability, version, { code: 'NOT_APPLICABLE', entityType });
  }
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const combineConfidence = (mode: 'min' | 'product' | 'mean', xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  switch (mode) {
    case 'min': return Math.min(...xs);
    case 'product': return xs.reduce((a, b) => a * b, 1);
    case 'mean': return xs.reduce((a, b) => a + b, 0) / xs.length;
  }
};

const weakest = (xs: readonly EvidenceClass[]): EvidenceClass => {
  const rank: Record<EvidenceClass, number> = {
    measured: 0, manufacturer: 1, stated: 2, community: 3, inferred: 4,
  };
  return xs.reduce((a, b) => (rank[a] >= rank[b] ? a : b), 'measured' as EvidenceClass);
};
