import { allK, NULL_SINK, type CapabilityKey, type EntityId, type CostSink } from '@camefa/engine-kernel';
import type { CompiledOntology } from '@camefa/engine-ontology';
import type { CapabilityRunner, CapabilityValue } from '@camefa/engine-capability';
import type { LineageNode } from '@camefa/engine-capability';
import { satisfactionOf, type Verdict } from './satisfaction.js';
import { aggregate } from './aggregate.js';
import type { Requirement, RequirementSet, RequirementId } from './requirement.js';

export interface Contribution {
  readonly requirement: RequirementId;
  readonly capability: CapabilityKey;
  readonly verdict: Verdict;
  readonly satisfaction: number;
  readonly deltaJnd: number | null;
  readonly weight: number;
  /** Leave-one-out impact on the aggregate. Positive = this requirement is dragging the score down. */
  readonly impact: number;
  readonly confidence: number;
  readonly note?: string;
  readonly rationale: string;
}

export interface ScoreInterval {
  readonly point: number;
  readonly lower: number;
  readonly upper: number;
  readonly confidence: number;
}

export interface Evaluation {
  readonly target: EntityId;
  readonly admitted: boolean;
  readonly verifiability: 'full' | 'partial';
  readonly score: ScoreInterval;
  readonly contributions: readonly Contribution[];
  readonly binding: readonly RequirementId[];
  readonly swing: readonly { readonly requirement: RequirementId; readonly gain: number }[];
  readonly unresolved: readonly CapabilityKey[];
  readonly lineage: readonly LineageNode[];
  readonly ontologyFingerprint: string;
}

/** Half-width of the satisfaction band contributed by fully unconfident evidence. */
const UNCERTAINTY_SLACK = 0.5;

export class Evaluator {
  constructor(
    private readonly ontology: CompiledOntology,
    private readonly runner: CapabilityRunner,
    private readonly sink: CostSink = NULL_SINK,
  ) {}

  async evaluateMany(
    candidates: readonly { readonly id: EntityId; readonly entityType: string }[],
    reqs: RequirementSet,
  ): Promise<readonly Evaluation[]> {
    const out: Evaluation[] = [];
    for (const candidate of candidates) {
      out.push(await this.evaluate(candidate.id, candidate.entityType, reqs));
    }
    return out;
  }

  async evaluate(
    target: EntityId,
    entityType: string,
    reqs: RequirementSet,
    field?: ReadonlyMap<CapabilityKey, { min: number; max: number }>,
  ): Promise<Evaluation> {
    const keys = [...new Set(reqs.requirements.map((r) => r.capability))].sort();
    const derived = await this.runner.derive(target, entityType, keys);

    const rows = reqs.requirements.map((req) => {
      this.sink.charge('scoringPasses', 1);
      return this.#score(req, derived.get(req.capability), field?.get(req.capability));
    });

    const gates = rows.filter((r) => r.req.hardness === 'blocking');
    const gateVerdict = allK(gates.map((r) => r.outcome.verdict));
    const weighted = rows.filter((r) => r.req.hardness === 'weighted');

    const parts = weighted.map((r) => ({ satisfaction: r.outcome.satisfaction, weight: r.req.weight }));
    const point = aggregate(parts, reqs.aggregationP);
    const lower = aggregate(weighted.map((r) => ({ satisfaction: r.band[0], weight: r.req.weight })), reqs.aggregationP);
    const upper = aggregate(weighted.map((r) => ({ satisfaction: r.band[1], weight: r.req.weight })), reqs.aggregationP);

    const contributions: Contribution[] = weighted.map((r, i) => {
      const without = aggregate(parts.filter((_, j) => j !== i), reqs.aggregationP);
      return {
        requirement: r.req.id,
        capability: r.req.capability,
        verdict: r.outcome.verdict,
        satisfaction: r.outcome.satisfaction,
        deltaJnd: r.outcome.deltaJnd,
        weight: r.req.weight,
        impact: without - point,
        confidence: r.confidence,
        ...(r.outcome.note ? { note: r.outcome.note } : {}),
        rationale: r.req.rationale,
      };
    });

    const gateContributions: Contribution[] = gates.map((r) => ({
      requirement: r.req.id,
      capability: r.req.capability,
      verdict: r.outcome.verdict,
      satisfaction: r.outcome.satisfaction,
      deltaJnd: r.outcome.deltaJnd,
      weight: 1,
      impact: r.outcome.verdict === 'violated' ? -point : 0,
      confidence: r.confidence,
      ...(r.outcome.note ? { note: r.outcome.note } : {}),
      rationale: r.req.rationale,
    }));

    const all = [...gateContributions, ...contributions]
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || (a.requirement < b.requirement ? -1 : 1));

    const unresolved = rows
      .filter((r) => r.outcome.verdict === 'indeterminate')
      .map((r) => r.req.capability);

    return {
      target,
      admitted: gateVerdict !== 'violated',
      verifiability: unresolved.length === 0 ? 'full' : 'partial',
      score: {
        point,
        lower: Math.min(lower, point),
        upper: Math.max(upper, point),
        confidence: rows.length === 0 ? 0 : Math.min(...rows.map((r) => r.confidence)),
      },
      contributions: all,
      binding: all
        .filter((c) => c.verdict === 'violated' || c.satisfaction < 0.5)
        .map((c) => c.requirement),
      swing: contributions
        .map((c) => ({ requirement: c.requirement, gain: c.impact }))
        .filter((s) => s.gain > 0)
        .sort((a, b) => b.gain - a.gain),
      unresolved: [...new Set(unresolved)],
      lineage: [...derived.values()].map((v) => v.lineage),
      ontologyFingerprint: this.ontology.fingerprint,
    };
  }

  #score(
    req: Requirement,
    value: CapabilityValue | undefined,
    field: { min: number; max: number } | undefined,
  ) {
    const def = this.ontology.capabilities.get(req.capability);
    if (!def || !value) {
      return {
        req,
        outcome: { verdict: 'indeterminate' as Verdict, satisfaction: 0.5, deltaJnd: null, note: 'unmeasurable' },
        confidence: 0,
        band: [0, 1] as [number, number],
      };
    }
    const outcome = satisfactionOf(value.result, req, def, this.ontology.units, field);
    const slack = (1 - value.confidence) * UNCERTAINTY_SLACK;
    const band: [number, number] =
      outcome.verdict === 'indeterminate'
        ? [0, 1]
        : [clamp01(outcome.satisfaction - slack), clamp01(outcome.satisfaction + slack)];
    return { req, outcome, confidence: value.confidence, band };
  }
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
