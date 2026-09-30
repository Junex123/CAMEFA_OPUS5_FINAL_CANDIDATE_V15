import {
  canonicalHash,
  sealReceipt,
  RECEIPT_SCHEMA_V1,
  type DecisionReceipt,
  type DecisionRequest,
  type Decision,
  type RankedCandidate,
  type EliminatedCandidate,
  type CoverageReport,
  type LineageNode,
  type StreamEvent,
  type EngineVersions,
  type EpochRef,
} from '@camefa/engine-contracts';
import type { CapabilityKey, EntityId } from '@camefa/engine-kernel';
import type { CompiledOntology, ActivityKey, CapabilityDefinition } from '@camefa/engine-ontology';
import type { CapabilityRunner } from '@camefa/engine-capability';
import { Evaluator, type Evaluation } from './evaluate.js';
import { rank } from './rank.js';
import { expandActivity, type Requirement, type RequirementSet, type RequirementId } from './requirement.js';
import { mergeRequirements } from './merge.js';

export interface DecisionRuntimeContext {
  readonly request: DecisionRequest;
  readonly ontology: CompiledOntology;
  readonly runner: CapabilityRunner;
  readonly evaluator: Evaluator;
  readonly versions: EngineVersions;
  readonly meter: import('@camefa/engine-kernel').CostMeter;
  readonly now: () => string;
  readonly defaultEntityType?: string;
}

export async function evaluateDecision(ctx: DecisionRuntimeContext): Promise<DecisionReceipt> {
  const requirements = requirementsFromRequest(ctx.request, ctx.ontology);
  const capabilityKeys = [...new Set(requirements.requirements.map((r) => r.capability))].sort();
  const entityType = ctx.request.entityType ?? inferEntityType(ctx.ontology, capabilityKeys, ctx.defaultEntityType);
  const candidates = ctx.request.candidates.map((id) => ({ id: id as unknown as EntityId, entityType }));
  const fields = await buildRelativeFields(candidates, capabilityKeys, ctx.runner, ctx.ontology);
  const evaluations: Evaluation[] = [];
  for (const candidate of candidates) {
    evaluations.push(await ctx.evaluator.evaluate(candidate.id, candidate.entityType, requirements, fields));
  }
  const groups = rank(evaluations);
  const decision: Decision = toDecision(groups, evaluations);
  const lineage = buildDecisionLineage(ctx.request.profile, evaluations, decision);
  const coverage = coverageOf(evaluations);
  const epoch: EpochRef = { id: `engine:${ctx.versions.build}`, version: ctx.versions.ontology, fingerprint: canonicalHash(ctx.versions) };
  const sealedAt = ctx.now();
  return sealReceipt({ schema: RECEIPT_SCHEMA_V1, sealedAt, epoch, versions: ctx.versions, request: ctx.request, decision, coverage, lineage, cost: reportCost(ctx.meter) });
}

export async function* evaluateDecisionStream(ctx: DecisionRuntimeContext): AsyncGenerator<StreamEvent> {
  const receipt = await evaluateDecision(ctx);
  yield { type: 'coverage', coverage: receipt.coverage };
  for (const candidate of receipt.decision.eliminated) yield { type: 'eliminated', candidate };
  for (const entry of receipt.decision.ranking) yield { type: 'ranked', entry };
  yield { type: 'fragility_progress', completed: 0, total: 0 };
  yield { type: 'sealed', receipt };
}

function requirementsFromRequest(request: DecisionRequest, ontology: CompiledOntology): RequirementSet {
  const collected: Requirement[] = [];
  let aggregationP = 0;
  const activity = ontology.activities.get(request.profile as ActivityKey);
  if (activity) {
    const profileSet = expandActivity(activity);
    collected.push(...profileSet.requirements);
    aggregationP = Math.min(0, profileSet.aggregationP);
  }
  for (let i = 0; i < request.constraints.length; i += 1) {
    const constraint = request.constraints[i]!;
    const capability = constraint.attribute as unknown as CapabilityKey;
    const def = ontology.capabilities.get(capability);
    if (!def) throw new Error(`unknown capability in constraint: ${constraint.attribute}`);
    if (constraint.op === 'in') throw new Error(`unsupported constraint operator 'in' for ${constraint.attribute}`);
    const target = targetFromValue(def, constraint.value);
    if (constraint.op === 'eq') {
      collected.push({ id: `stated:eq:${i}` as RequirementId, capability, op: 'within', ...(target === undefined ? {} : { target }), band: zeroBand(def), hardness: 'blocking', weight: 1, origin: { kind: 'stated' }, rationale: 'Exact value constraint supplied by the request.' });
      continue;
    }
    collected.push({ id: `stated:constraint:${i}` as RequirementId, capability, op: constraint.op, ...(target === undefined ? {} : { target }), hardness: 'blocking', weight: 1, origin: { kind: 'stated' }, rationale: 'Hard constraint supplied by the request.' });
  }
  for (let i = 0; i < request.weights.length; i += 1) {
    const weight = request.weights[i]!;
    const capability = weight.attribute as unknown as CapabilityKey;
    const def = ontology.capabilities.get(capability);
    if (!def) throw new Error(`unknown capability in weight: ${weight.attribute}`);
    if (def.output.kind === 'ordinal') {
      const top = def.output.levels.at(-1);
      if (!top) throw new Error(`ordinal capability has no levels: ${capability}`);
      collected.push({ id: `stated:weight:${i}` as RequirementId, capability, op: 'gte', target: { kind: 'ordinal', level: top }, hardness: 'weighted', weight: weight.weight, origin: { kind: 'stated' }, rationale: 'Higher ordinal capability is preferred according to the request weight.' });
      continue;
    }
    collected.push({ id: `stated:weight:${i}` as RequirementId, capability, op: def.interpretation === 'lower_is_better' ? 'minimize' : 'maximize', hardness: 'weighted', weight: weight.weight, origin: { kind: 'stated' }, rationale: 'Relative preference supplied by the request weight.' });
  }
  const merged = mergeRequirements(collected, ontology.units);
  return { requirements: merged.merged, aggregationP };
}

function targetFromValue(def: CapabilityDefinition, raw: number | string | readonly string[]): Requirement['target'] {
  if (Array.isArray(raw)) throw new Error('array constraint values are not supported by the canonical requirement model');
  if (def.output.kind === 'ordinal') {
    if (typeof raw !== 'string') throw new Error(`ordinal capability requires a string target: ${def.key}`);
    return { kind: 'ordinal', level: raw };
  }
  if (typeof raw !== 'number') throw new Error(`quantity capability requires a numeric target: ${def.key}`);
  return { kind: 'quantity', value: { value: raw, unit: def.output.canonicalUnit } };
}

function zeroBand(def: CapabilityDefinition): NonNullable<Requirement['band']> {
  if (def.output.kind !== 'quantity') throw new Error(`exact constraints are not supported for ordinal capability: ${def.key}`);
  return { value: 0, unit: def.output.canonicalUnit };
}

async function buildRelativeFields(candidates: readonly { id: EntityId; entityType: string }[], capabilityKeys: readonly CapabilityKey[], runner: CapabilityRunner, ontology: CompiledOntology): Promise<ReadonlyMap<CapabilityKey, { min: number; max: number }>> {
  const samples = new Map<CapabilityKey, number[]>();
  for (const key of capabilityKeys) samples.set(key, []);
  for (const candidate of candidates) {
    const derived = await runner.derive(candidate.id, candidate.entityType, capabilityKeys);
    for (const key of capabilityKeys) {
      const value = derived.get(key)?.result;
      if (!value || value.kind === 'unknown' || 'ordinal' in value.value) continue;
      const definition = ontology.capabilities.get(key);
      if (!definition || definition.output.kind !== 'quantity') continue;
      const converted = ontology.units.convert(value.value, definition.output.canonicalUnit);
      if (converted.ok) samples.get(key)!.push(converted.value.value);
    }
  }
  const out = new Map<CapabilityKey, { min: number; max: number }>();
  for (const [key, values] of samples) {
    if (values.length === 0) continue;
    out.set(key, { min: Math.min(...values), max: Math.max(...values) });
  }
  return out;
}

function inferEntityType(ontology: CompiledOntology, capabilityKeys: readonly CapabilityKey[], preferred?: string): string {
  if (preferred && ontology.entityTypes.has(preferred as never)) return preferred;
  const candidates = [...ontology.entityTypes.values()].filter((t) => !t.abstract);
  const match = candidates.find((t) => capabilityKeys.every((key) => {
    const cap = ontology.capabilities.get(key);
    return cap ? cap.appliesTo.some((applies) => ontology.isA(t.key, applies)) : false;
  }));
  return String(match?.key ?? 'gear');
}

function toDecision(groups: ReturnType<typeof rank>, evaluations: readonly Evaluation[]): Decision {
  const ranking: RankedCandidate[] = groups.flatMap((group) => group.tied.map((evaluation) => ({ slot: evaluation.target as never, score: evaluation.score.point })));
  const admittedIds = new Set(ranking.map((r) => r.slot));
  const eliminated: EliminatedCandidate[] = evaluations.filter((evaluation) => !admittedIds.has(evaluation.target as never)).map((evaluation) => ({ slot: evaluation.target as never, reason: evaluation.binding.length > 0 ? { kind: 'hard_constraint' as const, attribute: evaluation.binding[0] as never, detail: `candidate failed requirement ${evaluation.binding[0]}` } : { kind: 'insufficient_coverage' as const, attributes: evaluation.unresolved as never } }));
  if (ranking.length === 0) return { outcome: eliminated.length > 0 ? 'none_qualify' : 'abstained', winner: null, ranking: [], eliminated, ...(eliminated.length === 0 ? { abstentionReason: 'coverage_floor' as const } : {}) };
  return { outcome: 'ranked', winner: ranking[0]!.slot, ranking, eliminated };
}

function buildDecisionLineage(profile: string, evaluations: readonly Evaluation[], decision: Decision): LineageNode {
  const nodes = evaluations.flatMap((evaluation) => evaluation.lineage);
  return { nodeId: `decision:${canonicalHash({ profile, candidates: evaluations.map((e) => e.target) })}`, kind: 'aggregation', label: `${profile} decision — ${decision.outcome}`, children: nodes };
}

function coverageOf(evaluations: readonly Evaluation[]): CoverageReport {
  const sourceCounts = new Map<string, Set<string>>();
  let partial = false;
  for (const evaluation of evaluations) {
    partial ||= evaluation.verifiability === 'partial';
    walkLineage(evaluation.lineage, (attribute, source) => {
      const set = sourceCounts.get(attribute) ?? new Set<string>();
      if (source) set.add(source);
      sourceCounts.set(attribute, set);
    });
  }
  return { belowFloor: partial && evaluations.every((evaluation) => !evaluation.admitted), withheldByLicense: 0, perAttribute: [...sourceCounts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([attribute, sources]) => ({ attribute: attribute as never, sources: sources.size })) };
}

function walkLineage(nodes: readonly LineageNode[], visit: (attribute: string, source: string | null) => void): void {
  for (const node of nodes) {
    if (node.kind === 'claim') {
      for (const source of node.contributing) visit(String(node.attribute), source);
      continue;
    }
    if (node.kind === 'derivation') {
      walkLineage(node.inputs, visit);
      continue;
    }
    walkLineage(node.children, visit);
  }
}

function reportCost(meter: import('@camefa/engine-kernel').CostMeter) { return meter.report(); }
