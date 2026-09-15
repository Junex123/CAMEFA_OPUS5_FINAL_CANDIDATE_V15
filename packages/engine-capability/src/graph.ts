import { sha256, ok, err, type Result, type CapabilityKey } from '@camefa/engine-kernel';
import type { CompiledOntology } from '@camefa/engine-ontology';
import { DerivationRegistry, normalizeDerivation, type AnyDerivation, type Derivation } from './derivation.js';
import type { Diagnostic } from '@camefa/engine-contracts';

export interface CapabilityGraph {
  readonly fingerprint: string;
  readonly ontology: CompiledOntology;
  readonly derivations: DerivationRegistry;
  readonly topology: readonly CapabilityKey[];
}

export interface BuildCapabilityGraphArgs {
  readonly ontology: CompiledOntology;
  readonly derivations: DerivationRegistry | readonly AnyDerivation[];
}

export function buildCapabilityGraph(args: BuildCapabilityGraphArgs): Result<CapabilityGraph, readonly Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const registry = args.derivations instanceof DerivationRegistry ? args.derivations : new DerivationRegistry(args.derivations);
  for (const d of registry.values()) {
    if (!args.ontology.capabilities.has(d.capability)) diagnostics.push({ code: 'UNKNOWN_CAPABILITY', message: `derivation ${d.id} targets unknown capability ${d.capability}`, severity: 'error' });
  }
  if (diagnostics.length) return err(diagnostics);
  const topology = args.ontology.topology.filter((key) => registry.values().some((d) => d.capability === key));
  return ok({ fingerprint: sha256({ ontology: args.ontology.fingerprint, derivations: registry.values() }) as string, ontology: args.ontology, derivations: registry, topology });
}

export { DerivationRegistry, normalizeDerivation };
export type { Derivation };
