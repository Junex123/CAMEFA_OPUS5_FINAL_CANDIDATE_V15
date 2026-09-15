import type { AttributeKey, CapabilityKey, DerivationId, Quantity, UnitRegistry } from '@camefa/engine-kernel';
import type { CompiledOntology } from '@camefa/engine-ontology';
import type { ClaimValue, EvidenceClass } from './ports.js';
import type { LineageNode } from './lineage.js';

export type UnknownReason =
  | { readonly code: 'MISSING_INPUT'; readonly input: string }
  | { readonly code: 'INPUT_UNKNOWN'; readonly input: string }
  | { readonly code: 'OUT_OF_DOMAIN'; readonly detail: string }
  | { readonly code: 'NOT_APPLICABLE'; readonly entityType: string };

export type CapabilityResult =
  | { readonly kind: 'value'; readonly value: Quantity | { readonly ordinal: string } }
  | { readonly kind: 'unknown'; readonly reason: UnknownReason };

export interface ResolvedInputs {
  attribute(key: AttributeKey): ClaimValue | undefined;
  quantity(key: AttributeKey): Quantity | undefined;
  number(key: AttributeKey): number | undefined;
  boolean(key: AttributeKey): boolean | undefined;
  enumValue(key: AttributeKey): string | undefined;
  capability(key: CapabilityKey): CapabilityResult | undefined;
  confidenceOf(key: AttributeKey | CapabilityKey): number;
  evidenceOf(key: AttributeKey | CapabilityKey): EvidenceClass | undefined;
  has(key: AttributeKey | CapabilityKey): boolean;
}

export interface DerivationContext {
  readonly ontology: CompiledOntology;
  readonly units: UnitRegistry;
  readonly entityType: string;
}

export interface DerivationStrategy {
  readonly label: 'primary' | 'fallback';
  readonly requires: readonly (AttributeKey | CapabilityKey)[];
  readonly reliability: number;
  readonly emits: EvidenceClass | 'inherit';
  compute(inputs: ResolvedInputs, ctx: DerivationContext): CapabilityResult;
}

/** Canonical post-ADR-080 derivation declaration. */
export interface Derivation {
  readonly id: DerivationId;
  readonly capability: CapabilityKey;
  readonly version: string;
  readonly confidenceCombinator: 'min' | 'product' | 'mean';
  readonly strategies: readonly DerivationStrategy[];
}

/** Pre-ADR-080 derivation form retained only for source compatibility with early packs/tests. */
export interface LegacyDerivation {
  readonly derivationId: string;
  readonly packId: string;
  readonly produces: string;
  readonly requires: readonly string[];
  readonly optional?: readonly string[];
  readonly unit: string;
  readonly rationale?: string;
  compute(ctx: { has(key: string): boolean; value(key: string): number }): number;
}

export type AnyDerivation = Derivation | LegacyDerivation;

export class DerivationRegistry {
  readonly #byId = new Map<string, Derivation>();

  constructor(derivations: readonly AnyDerivation[] = []) {
    for (const derivation of derivations) this.register(derivation);
  }

  register(input: AnyDerivation): void {
    const d = normalizeDerivation(input);
    if (this.#byId.has(d.id)) throw new Error(`duplicate derivation ${d.id}`);
    if (d.strategies.length === 0) throw new Error(`derivation ${d.id} has no strategies`);
    if (d.strategies[0]!.label !== 'primary') throw new Error(`derivation ${d.id}: first strategy must be primary`);
    this.#byId.set(String(d.id), d);
  }

  get(id: DerivationId): Derivation | undefined { return this.#byId.get(String(id)); }
  values(): readonly Derivation[] { return [...this.#byId.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))); }
}

export function normalizeDerivation(input: AnyDerivation): Derivation {
  if ('strategies' in input) return input;
  const legacy = input;
  const requires = legacy.requires.map((x) => x as AttributeKey | CapabilityKey);
  const strategy: DerivationStrategy = {
    label: 'primary',
    requires,
    reliability: 1,
    emits: 'inherit',
    compute(inputs) {
      try {
        const result = legacy.compute({
          has: (key) => inputs.has(key as AttributeKey | CapabilityKey),
          value: (key) => inputs.number(key as AttributeKey) ?? Number.NaN,
        });
        if (!Number.isFinite(result)) return { kind: 'unknown', reason: { code: 'OUT_OF_DOMAIN', detail: `non-finite result for ${legacy.derivationId}` } };
        const unitKey = legacy.unit as never;
        return {
          kind: 'value',
          value: { value: result, unit: unitKey } as unknown as Quantity,
        };
      } catch (e) {
        return { kind: 'unknown', reason: { code: 'INPUT_UNKNOWN', input: e instanceof Error ? e.message : String(e) } };
      }
    },
  };
  return {
    id: legacy.derivationId as DerivationId,
    capability: legacy.produces as CapabilityKey,
    version: legacy.packId,
    confidenceCombinator: 'min',
    strategies: [strategy],
  };
}

/** Legacy deterministic topological ordering used by the original derivation runner. */
export function topologicalOrder(ds: readonly LegacyDerivation[]): readonly LegacyDerivation[] {
  const byOutput = new Map<string, LegacyDerivation>();
  for (const d of ds) {
    if (byOutput.has(d.produces)) throw new Error(`duplicate derivation output ${d.produces}`);
    byOutput.set(d.produces, d);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const out: LegacyDerivation[] = [];
  const visit = (d: LegacyDerivation) => {
    const s = state.get(d.derivationId) ?? 0;
    if (s === 1) throw new Error(`derivation cycle at ${d.derivationId}`);
    if (s === 2) return;
    state.set(d.derivationId, 1);
    for (const r of d.requires) {
      const dep = byOutput.get(r);
      if (dep) visit(dep);
    }
    state.set(d.derivationId, 2);
    out.push(d);
  };
  for (const d of [...ds].sort((a, b) => a.derivationId.localeCompare(b.derivationId))) visit(d);
  return out;
}
