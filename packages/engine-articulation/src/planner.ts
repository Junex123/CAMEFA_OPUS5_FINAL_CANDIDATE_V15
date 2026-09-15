import { sha256, type CapabilityKey, type UnitRegistry } from '@camefa/engine-kernel';
import type { CompiledOntology } from '@camefa/engine-ontology';
import type { Evaluation, Contribution, RankedGroup } from '@camefa/engine-reasoning';
import type { Feasibility } from '@camefa/engine-reasoning';
import { collectClaims } from '@camefa/engine-capability';
import {
  type NarrativePlan, type PlanNode, type PlanNodeId, type Fact,
  type HedgeLevel, HEDGE_RANK,
} from './plan.js';

/** A camera has hundreds of attributes; roughly six decided this recommendation. */
const MAX_SUBSTANTIVE_NODES = 5;
const SALIENCE_THRESHOLD = 0.01;

export interface PlanInput {
  readonly groups: readonly RankedGroup[];
  readonly rejected: readonly Evaluation[];
  readonly feasibility?: Feasibility;
  readonly labels: ReadonlyMap<string, string>;
}

export class Planner {
  constructor(private readonly ontology: CompiledOntology) {}

  plan(input: PlanInput): NarrativePlan {
    const nodes: PlanNode[] = [];
    const omitted: { capability: CapabilityKey; reason: 'low_salience' }[] = [];

    const winner = input.groups[0]?.tied[0];
    if (!winner) return this.#noOption(input);

    const label = input.labels.get(winner.target) ?? winner.target;
    const tiedWith = (input.groups[0]?.tied ?? []).slice(1);

    nodes.push(this.#verdict(winner, label, tiedWith, input.labels));

    const drivers = winner.contributions
      .filter((c) => c.verdict !== 'indeterminate' && Math.abs(c.impact) >= SALIENCE_THRESHOLD)
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || (a.requirement < b.requirement ? -1 : 1));

    for (const c of drivers.slice(0, MAX_SUBSTANTIVE_NODES)) {
      nodes.push(this.#driver(c, winner, label));
    }
    for (const c of drivers.slice(MAX_SUBSTANTIVE_NODES)) {
      omitted.push({ capability: c.capability, reason: 'low_salience' });
    }

    // Mandatory when a tie group exists: state the runner-up's genuine advantage.
    const runnerUp = tiedWith[0] ?? input.groups[1]?.tied[0];
    if (runnerUp) {
      const node = this.#counterpoint(winner, runnerUp, input.labels);
      if (node) nodes.push(node);
    }

    for (const d of winner.dissent.slice(0, 2)) {
      nodes.push(this.#dissent(d, winner));
    }

    if (winner.verifiability === 'partial') nodes.push(this.#coverage(winner));

    if (input.feasibility?.kind === 'infeasible') {
      for (const r of input.feasibility.relaxations.slice(0, 1)) {
        nodes.push({
          id: `relax:${r.requirement}` as PlanNodeId,
          role: 'relaxation',
          salience: 1,
          hedge: 'assertive',
          facts: [{
            label: 'options unlocked', display: String(r.admits), numeric: r.admits,
            unit: null, capability: null, claimIds: [],
          }],
          template: `Nothing meets every requirement. Relaxing ${r.capability} would open up ${r.admits} option${r.admits === 1 ? '' : 's'}, and it is the least costly requirement to give up.`,
        });
      }
    }

    const hedgeFloor = nodes.reduce<HedgeLevel>(
      (worst, n) => (HEDGE_RANK[n.hedge] > HEDGE_RANK[worst] ? n.hedge : worst),
      'assertive',
    );

    return {
      id: sha256({ nodes: nodes.map((n) => ({ id: n.id, facts: n.facts })), hedgeFloor }),
      nodes,
      hedgeFloor,
      entityLabels: input.labels,
      omitted,
    };
  }

  #verdict(
    e: Evaluation, label: string,
    tied: readonly Evaluation[], labels: ReadonlyMap<string, string>,
  ): PlanNode {
    const tiedLabels = tied.map((t) => labels.get(t.target) ?? t.target);
    const template = tiedLabels.length > 0
      ? `${label} and ${joinList(tiedLabels)} are equivalent for what you need; choose between them on handling or price.`
      : `${label} is the strongest fit for what you need.`;
    return {
      id: 'verdict' as PlanNodeId,
      role: 'verdict',
      salience: 1,
      hedge: hedgeFor(e.score),
      facts: [{
        label: 'fit', display: e.score.point.toFixed(2), numeric: e.score.point,
        unit: null, capability: null,
        claimIds: [...e.lineage.values()].flatMap((n) => collectClaims(n).flatMap((c) => c.contributing)),
      }],
      template,
    };
  }

  #driver(c: Contribution, e: Evaluation, label: string): PlanNode {
    const def = this.ontology.capabilities.get(c.capability);
    const lineage = e.lineage.get(c.capability);
    const claimIds = lineage ? collectClaims(lineage).flatMap((n) => n.contributing) : [];
    const strong = c.satisfaction >= 0.5;
    const jnd = c.deltaJnd;

    const facts: Fact[] = [{
      label: def?.label ?? c.capability,
      display: jnd === null ? '' : `${Math.abs(jnd).toFixed(1)} JND`,
      numeric: jnd,
      unit: null,
      capability: c.capability,
      claimIds,
    }];

    const margin = jnd === null ? '' :
      Math.abs(jnd) < 1 ? ' by a margin you would not notice' :
      Math.abs(jnd) < 3 ? ' by a modest but visible margin' : ' comfortably';

    const template = c.note === 'saturated'
      ? `${label} exceeds what you need on ${def?.label ?? c.capability}; the surplus buys you nothing in practice.`
      : strong
        ? `It clears your ${def?.label ?? c.capability} requirement${margin}. ${c.rationale}`
        : `It falls short on ${def?.label ?? c.capability}${margin}. ${c.rationale}`;

    return {
      id: `driver:${c.requirement}` as PlanNodeId,
      role: strong ? 'because' : 'tradeoff',
      salience: Math.abs(c.impact),
      hedge: hedgeForConfidence(c.confidence),
      facts,
      template,
    };
  }

  #counterpoint(
    winner: Evaluation, other: Evaluation, labels: ReadonlyMap<string, string>,
  ): PlanNode | null {
    const byRequirement = new Map(winner.contributions.map((c) => [c.requirement, c]));
    const best = other.contributions
      .map((c) => ({ c, gap: c.satisfaction - (byRequirement.get(c.requirement)?.satisfaction ?? 0) }))
      .filter((x) => x.gap > 0.05)
      .sort((a, b) => b.gap - a.gap)[0];
    if (!best) return null;

    const def = this.ontology.capabilities.get(best.c.capability);
    const otherLabel = labels.get(other.target) ?? other.target;
    const lineage = other.lineage.get(best.c.capability);

    return {
      id: `counterpoint:${other.target}` as PlanNodeId,
      role: 'counterpoint',
      salience: best.gap,
      hedge: hedgeForConfidence(best.c.confidence),
      facts: [{
        label: def?.label ?? best.c.capability,
        display: '', numeric: null, unit: null,
        capability: best.c.capability,
        claimIds: lineage ? collectClaims(lineage).flatMap((n) => n.contributing) : [],
      }],
      template: `${otherLabel} is genuinely better on ${def?.label ?? best.c.capability}, so if that matters more to you than the rest, it is the one to take.`,
    };
  }

  #dissent(
    d: Evaluation['dissent'][number], e: Evaluation,
  ): PlanNode {
    const def = this.ontology.capabilities.get(d.capability);
    return {
      id: `caveat:${d.capability}` as PlanNodeId,
      role: 'caveat',
      salience: 0.4,
      hedge: 'qualified',
      facts: [{
        label: def?.label ?? d.capability,
        display: '', numeric: null, unit: null,
        capability: d.capability,
        claimIds: [...d.usedClaims, ...d.rejectedClaims],
      }],
      template: `Sources disagree on ${def?.label ?? d.capability}; we used the better-evidenced figure and discounted ${d.rejectedClaims.length} conflicting report${d.rejectedClaims.length === 1 ? '' : 's'}.`,
    };
  }

  #coverage(e: Evaluation): PlanNode {
    const names = e.unresolved
      .map((k) => this.ontology.capabilities.get(k)?.label ?? k)
      .slice(0, 3);
    return {
      id: 'coverage' as PlanNodeId,
      role: 'coverage',
      salience: 0.3,
      hedge: 'qualified',
      facts: [{
        label: 'unverified', display: String(e.unresolved.length),
        numeric: e.unresolved.length, unit: null, capability: null, claimIds: [],
      }],
      template: `We could not verify ${joinList(names)} for this body, so treat that part of the assessment as provisional.`,
    };
  }

  #noOption(input: PlanInput): NarrativePlan {
    const node: PlanNode = {
      id: 'verdict' as PlanNodeId,
      role: 'verdict',
      salience: 1,
      hedge: 'assertive',
      facts: [],
      template: 'Nothing in the current catalogue meets your requirements.',
    };
    return {
      id: sha256({ empty: true }),
      nodes: [node],
      hedgeFloor: 'assertive',
      entityLabels: input.labels,
      omitted: [],
    };
  }
}

const hedgeFor = (s: { point: number; lower: number; upper: number; confidence: number }): HedgeLevel => {
  const width = s.upper - s.lower;
  if (s.confidence < 0.4 || width > 0.25) return 'speculative';
  if (s.confidence < 0.7) return 'qualified';
  return width > 0.1 ? 'measured' : 'assertive';
};

const hedgeForConfidence = (c: number): HedgeLevel =>
  c < 0.4 ? 'speculative' : c < 0.7 ? 'qualified' : c < 0.92 ? 'measured' : 'assertive';

const joinList = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
