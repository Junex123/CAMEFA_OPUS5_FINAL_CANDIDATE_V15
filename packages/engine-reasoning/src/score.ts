import { weightedPowerMean, AGGREGATION_P } from '@camefa/engine-contracts';
import { convert, satisfaction, type AttributeDef } from '@camefa/engine-ontology';
import type { CostSink } from '@camefa/engine-kernel';
import type { AttributeValue } from './candidate.js';
import type { ProfileTerm } from './coverage.js';

export interface ScoredTerm {
  requirementId: string;
  attributeId: string;
  weight: number;
  rawValue: number;
  unit: string;
  satisfaction: number;
  /** Marginal effect on the aggregate of removing this term. */
  contribution: number;
  imputed: boolean;
  conflictId: string | null;
  confidence: number;
  rationale: string;
}

export interface ScoredCandidate {
  entityId: string;
  score: number;
  confidence: number;
  terms: ScoredTerm[];
}

export function scoreCandidate(
  entityId: string,
  values: ReadonlyMap<string, AttributeValue>,
  terms: readonly ProfileTerm[],
  attributes: ReadonlyMap<string, AttributeDef>,
  sink: CostSink,
  p: number = AGGREGATION_P,
): ScoredCandidate {
  const scored: ScoredTerm[] = [];

  for (const term of terms) {
    if (term.hard) continue;
    const held = values.get(term.attributeId);
    if (!held) continue;
    const def = attributes.get(term.attributeId);
    if (!def) continue;

    sink.charge('scoringPasses', 1);

    const value = held.unit === def.unit ? held.value : convert(held.value, held.unit, def.unit);
    scored.push({
      requirementId: term.requirementId,
      attributeId: term.attributeId,
      weight: term.weight,
      rawValue: value,
      unit: def.unit,
      satisfaction: satisfaction(term.requirement, value),
      contribution: 0,
      imputed: held.imputed,
      conflictId: held.conflictId,
      confidence: held.confidence,
      rationale: term.rationale,
    });
  }

  const asTerms = scored.map((t) => ({ weight: t.weight, value: t.satisfaction }));
  const score = weightedPowerMean(asTerms, p);

  // Leave-one-out contribution: how much the aggregate moves without this
  // term. Under p < 0 this is the honest way to attribute — a term's share of
  // the weighted sum is not its influence on the result.
  for (let i = 0; i < scored.length; i += 1) {
    const without = weightedPowerMean(
      asTerms.filter((_, j) => j !== i),
      p,
    );
    scored[i].contribution = score - without;
  }

  const confidence = scored.reduce((m, t) => Math.min(m, t.confidence), 1);

  return {
    entityId,
    score,
    confidence: scored.length === 0 ? 0 : confidence,
    terms: scored.sort(
      (a, b) => b.weight - a.weight || a.requirementId.localeCompare(b.requirementId),
    ),
  };
}
