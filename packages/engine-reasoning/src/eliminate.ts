import { satisfaction, type RequirementDef } from '@camefa/engine-ontology';
import type { BindingConstraint } from '@camefa/engine-contracts';

/**
 * Signed distance to the nearest point on the curve where satisfaction becomes
 * non-zero. Negative means unmet by that much. Reported in the attribute's own
 * unit so the reader sees "budgetUsd (-420)" rather than an abstract score.
 */
export function bindingMargin(req: RequirementDef, value: number): number {
  const passing = req.curve.filter((c) => c.satisfaction > 0);
  if (passing.length === 0) return 0;
  const nearest = passing.reduce((best, c) =>
    Math.abs(c.at - value) < Math.abs(best.at - value) ? c : best,
  );
  const met = satisfaction(req, value) > 0;
  const distance = Math.abs(value - nearest.at);
  return met ? distance : -distance;
}

export interface EliminationResult {
  eliminated: boolean;
  binding: BindingConstraint | null;
  /** Every unmet hard requirement, not only the reported one. */
  allUnmet: BindingConstraint[];
}

/**
 * Elimination reports the *worst* unmet hard requirement as binding, and keeps
 * the full list. Reporting only the first tested one makes the explanation an
 * artefact of iteration order, and a reader who fixes it discovers a second
 * blocker they were never told about.
 */
export function eliminate(
  checks: readonly { requirement: RequirementDef; requirementId: string; value: number | null }[],
): EliminationResult {
  const unmet: BindingConstraint[] = [];

  for (const check of checks) {
    if (check.value === null) {
      unmet.push({ requirement: check.requirementId, margin: Number.NEGATIVE_INFINITY });
      continue;
    }
    if (satisfaction(check.requirement, check.value) <= 0) {
      unmet.push({
        requirement: check.requirementId,
        margin: bindingMargin(check.requirement, check.value),
      });
    }
  }

  unmet.sort((a, b) => a.margin - b.margin || a.requirement.localeCompare(b.requirement));

  return {
    eliminated: unmet.length > 0,
    binding: unmet[0] ?? null,
    allUnmet: unmet,
  };
}
