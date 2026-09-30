import {
  canonicalHash, type DecisionEngineClient, type DecisionReceipt, type DecisionRequest,
  type EngineVersions, type StreamEvent, type Diagnostic,
} from '@camefa/engine-contracts';
import { CostMeter, type CostBudget } from '@camefa/engine-kernel';
import { compileOntology, type CompiledOntology, type OntologyPack } from '@camefa/engine-ontology';
import { buildCapabilityGraph, type CapabilityGraph, type DerivationRegistry, type AnyDerivation, type ClaimResolverPort } from '@camefa/engine-capability';
import { evaluateDecision, evaluateDecisionStream, DEFAULT_IMPUTATION, DEFAULT_REASONING, type ImputationPolicy, type ReasoningConfig } from '@camefa/engine-reasoning';

export interface EngineDeps {
  readonly ontologySource: readonly OntologyPack[];
  readonly derivations: DerivationRegistry | readonly AnyDerivation[];
  readonly claims: ClaimResolverPort;
  readonly reasoning: ReasoningConfig;
  readonly imputation: ImputationPolicy;
  readonly budget: CostBudget;
  readonly now: () => string;
  readonly buildFingerprint: string;
}
export interface Engine extends DecisionEngineClient {
  readonly versions: EngineVersions;
  readonly ontology: CompiledOntology;
  readonly capabilities: CapabilityGraph;
}

export function createEngine(deps: EngineDeps): Engine {
  const compiled = compileOntology(deps.ontologySource);
  if (!compiled.ok) throw new EngineAssemblyError('ontology compilation failed', compiled.error);
  const ontology = compiled.value;
  const capabilities = buildCapabilityGraph({ ontology, derivations: deps.derivations });
  if (!capabilities.ok) throw new EngineAssemblyError('capability graph invalid', capabilities.error);
  const graph = capabilities.value;
  const versions: EngineVersions = {
    build: deps.buildFingerprint,
    ontology: String(ontology.fingerprint),
    capability: graph.fingerprint,
    reasoning: canonicalHash({ reasoning: deps.reasoning, imputation: deps.imputation }),
  };
  const context = () => ({
    ontology,
    capabilities: graph,
    claims: deps.claims,
    reasoning: deps.reasoning,
    imputation: deps.imputation,
    versions,
    meter: new CostMeter(deps.budget),
    now: deps.now,
    defaultEntityType: deps.reasoning.defaultEntityType,
  });
  return {
    versions,
    ontology,
    capabilities: graph,
    evaluate: (request: DecisionRequest): Promise<DecisionReceipt> => evaluateDecision({ request, ...context() }),
    evaluateStream: (request: DecisionRequest): AsyncGenerator<StreamEvent> => evaluateDecisionStream({ request, ...context() }),
  };
}

export { DEFAULT_REASONING, DEFAULT_IMPUTATION };
export type { ReasoningConfig, ImputationPolicy };

export class EngineAssemblyError extends Error {
  constructor(message: string, readonly diagnostics: readonly Diagnostic[] | unknown) {
    const list = Array.isArray(diagnostics) ? diagnostics : [];
    super(`${message}${list.length ? `: ${list.map((d) => `${d.code} ${d.message}`).join('; ')}` : ''}`);
    this.name = 'EngineAssemblyError';
  }
}
