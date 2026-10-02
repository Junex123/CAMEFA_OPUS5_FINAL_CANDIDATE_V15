import { canonicalHash } from '@camefa/engine-contracts';

export interface AnchorCandidate {
  slotKey: string; // `${entityId}|${attribute}`
  entityId: string;
  entityLabel: string;
  attribute: string;
  stratum: string;
  /** Golden expectations that could be promoted from editorial to anchor. */
  gateCoverageGain: number;
  /** Sealed decisions where this slot is decisive (ADR-070 leverage). */
  decisiveDecisions: number;
  /** Normalised disagreement among competing claims, 0..1. */
  disputeSpread: number;
  /** Age of the existing anchor in days; null if never measured. */
  anchorAgeDays: number | null;
  measurementCostMinutes: number;
  feasible: boolean;
}

export interface PlanPolicy {
  budgetMinutes: number;
  /** Share of budget spent on slots chosen without reference to model beliefs. */
  explorationFraction: number;
  /** No stratum may take more than this share of the targeted budget. */
  maxStratumShare: number;
  /** Anchors older than this decay toward zero value. */
  halfLifeDays: number;
  seed: string;
}

export const DEFAULT_PLAN_POLICY: PlanPolicy = {
  budgetMinutes: 240,
  explorationFraction: 0.3,
  maxStratumShare: 0.5,
  halfLifeDays: 540,
  seed: 'camefa',
};

export type Selection = 'targeted' | 'exploratory';

export interface PlannedAnchor {
  slotKey: string;
  entityId: string;
  entityLabel: string;
  attribute: string;
  stratum: string;
  selection: Selection;
  value: number;
  valuePerMinute: number;
  measurementCostMinutes: number;
  reason: string;
}

export interface AnchorPlan {
  planId: string;
  targeted: PlannedAnchor[];
  exploratory: PlannedAnchor[];
  spentMinutes: number;
  budgetMinutes: number;
  skippedInfeasible: number;
  stratumCaps: Record<string, number>;
}

/** Deterministic PRNG; plans must be reproducible from (candidates, policy). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function anchorValue(c: AnchorCandidate, policy: PlanPolicy): number {
  // Coverage gain dominates: an attribute with no anchor at all cannot be
  // gated on, so the first measurement in a family is worth more than the
  // tenth in a well-covered one.
  const coverage = c.gateCoverageGain * 3;
  // Decision impact saturates — a slot decisive in 500 decisions is not fifty
  // times more urgent than one decisive in 10.
  const impact = Math.log1p(c.decisiveDecisions) * (0.25 + 0.75 * c.disputeSpread);
  const staleness =
    c.anchorAgeDays === null
      ? 1
      : 1 - 0.5 ** (c.anchorAgeDays / policy.halfLifeDays);
  return (coverage + impact) * staleness;
}

function take(
  pool: PlannedAnchor[],
  budget: number,
  caps: Map<string, number> | null,
): { picked: PlannedAnchor[]; spent: number } {
  const picked: PlannedAnchor[] = [];
  const used = new Map<string, number>();
  let spent = 0;

  for (const p of pool) {
    if (spent + p.measurementCostMinutes > budget) continue;
    if (caps) {
      const cap = caps.get(p.stratum) ?? Infinity;
      const soFar = used.get(p.stratum) ?? 0;
      if (soFar + p.measurementCostMinutes > cap) continue;
      used.set(p.stratum, soFar + p.measurementCostMinutes);
    }
    picked.push(p);
    spent += p.measurementCostMinutes;
  }
  return { picked, spent };
}

/**
 * Targeted selection asks the engine where measurement would change answers.
 * That is exactly the set of places the engine already knows it is uncertain,
 * so a plan built only from it can never discover a region where the engine is
 * confident and wrong. A fixed share of budget is therefore spent on slots
 * drawn without reference to any model belief (ADR-072).
 */
export function planAnchorBatch(
  candidates: readonly AnchorCandidate[],
  policy: PlanPolicy = DEFAULT_PLAN_POLICY,
): AnchorPlan {
  const feasible = candidates.filter((c) => c.feasible);
  const skippedInfeasible = candidates.length - feasible.length;

  const exploreBudget = policy.budgetMinutes * policy.explorationFraction;
  const targetBudget = policy.budgetMinutes - exploreBudget;

  const strata = [...new Set(feasible.map((c) => c.stratum))].sort();
  const caps = new Map(
    strata.map((s) => [s, targetBudget * policy.maxStratumShare]),
  );

  const scored = feasible
    .map((c) => {
      const value = anchorValue(c, policy);
      return {
        slotKey: c.slotKey,
        entityId: c.entityId,
        entityLabel: c.entityLabel,
        attribute: c.attribute,
        stratum: c.stratum,
        selection: 'targeted' as Selection,
        value,
        valuePerMinute: value / Math.max(1, c.measurementCostMinutes),
        measurementCostMinutes: c.measurementCostMinutes,
        reason:
          c.gateCoverageGain > 0
            ? `unblocks ${c.gateCoverageGain} gate expectation(s)`
            : `decisive in ${c.decisiveDecisions} sealed decision(s)`,
      };
    })
    .sort(
      (a, b) =>
        b.valuePerMinute - a.valuePerMinute || a.slotKey.localeCompare(b.slotKey),
    );

  const targeted = take(scored, targetBudget, caps);
  const chosen = new Set(targeted.picked.map((p) => p.slotKey));

  // Exploration: uniform over remaining feasible slots, stratified round-robin
  // so a large stratum cannot swallow the exploratory quota either.
  const rand = mulberry32(seedOf(`${policy.seed}:${strata.join(',')}`));
  const byStratum = new Map<string, AnchorCandidate[]>();
  for (const c of feasible) {
    if (chosen.has(c.slotKey)) continue;
    const list = byStratum.get(c.stratum) ?? [];
    list.push(c);
    byStratum.set(c.stratum, list);
  }
  for (const list of byStratum.values()) {
    list.sort((a, b) => a.slotKey.localeCompare(b.slotKey));
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const left = list[i]!;
      const right = list[j]!;
      list[i] = right;
      list[j] = left;
    }
  }

  const roundRobin: PlannedAnchor[] = [];
  let depth = 0;
  let added = true;
  while (added) {
    added = false;
    for (const s of strata) {
      const c = byStratum.get(s)?.[depth];
      if (!c) continue;
      added = true;
      roundRobin.push({
        slotKey: c.slotKey,
        entityId: c.entityId,
        entityLabel: c.entityLabel,
        attribute: c.attribute,
        stratum: c.stratum,
        selection: 'exploratory',
        value: 0,
        valuePerMinute: 0,
        measurementCostMinutes: c.measurementCostMinutes,
        reason: 'blind sample — selected without reference to model belief',
      });
    }
    depth += 1;
  }

  const exploratory = take(roundRobin, exploreBudget, null);

  return {
    planId: canonicalHash({
      slots: [...targeted.picked, ...exploratory.picked].map((p) => p.slotKey),
      policy,
    }).slice(0, 16),
    targeted: targeted.picked,
    exploratory: exploratory.picked,
    spentMinutes: targeted.spent + exploratory.spent,
    budgetMinutes: policy.budgetMinutes,
    skippedInfeasible,
    stratumCaps: Object.fromEntries(caps),
  };
}
