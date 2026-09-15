import { emphasisWeight, type Emphasis } from '@camefa/engine-contracts';
import type { RequirementDef } from '@camefa/engine-ontology';
import type { AttributeValue, Candidate } from './candidate.js';

export interface ProfileTerm {
  requirementId: string;
  attributeId: string;
  hard: boolean;
  weight: number;
  emphasis: Emphasis;
  requirement: RequirementDef;
  rationale: string;
}

export interface CoverageVerdict {
  entityId: string;
  missingHard: string[];
  missingSoft: string[];
  /** Fraction of soft weight backed by an observed value. */
  softCoverage: number;
  admissible: boolean;
  reason: string | null;
}

export const MIN_SOFT_COVERAGE = 0.6;

export function assessCandidateCoverage(
  candidate: Candidate,
  terms: readonly ProfileTerm[],
): CoverageVerdict {
  const missingHard: string[] = [];
  const missingSoft: string[] = [];
  let softTotal = 0;
  let softPresent = 0;

  for (const term of terms) {
    const present = candidate.values.has(term.attributeId);
    if (term.hard) {
      if (!present) missingHard.push(term.attributeId);
      continue;
    }
    softTotal += term.weight;
    if (present) softPresent += term.weight;
    else missingSoft.push(term.attributeId);
  }

  const softCoverage = softTotal <= 0 ? 1 : softPresent / softTotal;

  if (missingHard.length > 0) {
    return {
      entityId: candidate.entityId,
      missingHard,
      missingSoft,
      softCoverage,
      admissible: false,
      reason: `no evidence for hard requirement attribute(s): ${missingHard.join(', ')}`,
    };
  }
  if (softCoverage < MIN_SOFT_COVERAGE) {
    return {
      entityId: candidate.entityId,
      missingHard,
      missingSoft,
      softCoverage,
      admissible: false,
      reason: `only ${(softCoverage * 100).toFixed(0)}% of weighted requirements have evidence (need ${MIN_SOFT_COVERAGE * 100}%)`,
    };
  }
  return {
    entityId: candidate.entityId,
    missingHard,
    missingSoft,
    softCoverage,
    admissible: true,
    reason: null,
  };
}

/**
 * Pessimistic imputation (ADR-076). A missing soft value is filled with the
 * worst observed value among admissible candidates, so absent data can never
 * be an advantage. Skipping the term instead would reward poor coverage; using
 * zero would let one gap floor the score under p < 0 and eliminate by ignorance.
 */
export function imputeMissing(
  candidates: readonly Candidate[],
  terms: readonly ProfileTerm[],
  direction: (attributeId: string) => 'higher_better' | 'lower_better' | 'target',
): Map<string, AttributeValue> {
  const floors = new Map<string, AttributeValue>();

  for (const term of terms) {
    if (term.hard) continue;
    const observed = candidates
      .map((c) => c.values.get(term.attributeId))
      .filter((v): v is AttributeValue => v !== undefined && !v.imputed);
    if (observed.length === 0) continue;

    const dir = direction(term.attributeId);
    const worst = observed.reduce((acc, v) => {
      if (dir === 'lower_better') return v.value > acc.value ? v : acc;
      if (dir === 'higher_better') return v.value < acc.value ? v : acc;
      // For target attributes, worst is the value furthest from the median.
      return acc;
    }, observed[0]);

    floors.set(term.attributeId, {
      value: worst.value,
      unit: worst.unit,
      evidence: [],
      confidence: 0,
      derived: false,
      derivationId: null,
      conflictId: null,
      imputed: true,
      outlierFlags: ['imputed_pessimistic'],
    });
  }

  return floors;
}
