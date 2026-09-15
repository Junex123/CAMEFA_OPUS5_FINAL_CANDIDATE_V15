import type { EntityId } from '@camefa/engine-kernel';
import type { Evaluator } from './evaluate.js';
import type { Requirement, RequirementSet } from './requirement.js';

export type Feasibility =
  | { readonly kind: 'feasible'; readonly admitted: number }
  | {
      readonly kind: 'infeasible';
      readonly conflicting: readonly string[];
      readonly relaxations: readonly Relaxation[];
    };

export interface Relaxation {
  readonly requirement: string;
  readonly capability: string;
  readonly admits: number;
  readonly rationale: string;
}

export const checkFeasibility = async (
  evaluator: Evaluator,
  candidates: readonly { readonly id: EntityId; readonly entityType: string }[],
  set: RequirementSet,
): Promise<Feasibility> => {
  const base = await evaluator.evaluateMany(candidates, set);
  const admitted = base.filter((e) => e.admitted).length;
  if (admitted > 0) return { kind: 'feasible', admitted };

  const gates = set.requirements.filter((r) => r.hardness === 'blocking');
  const relaxations: Relaxation[] = [];

  for (const gate of gates) {
    const without: RequirementSet = {
      ...set,
      requirements: set.requirements.map((r): Requirement =>
        r.id === gate.id ? { ...r, hardness: 'weighted' } : r,
      ),
    };
    const trial = await evaluator.evaluateMany(candidates, without);
    relaxations.push({
      requirement: gate.id,
      capability: gate.capability,
      admits: trial.filter((e) => e.admitted).length,
      rationale: gate.rationale,
    });
  }

  return {
    kind: 'infeasible',
    conflicting: gates.map((g) => g.id),
    relaxations: relaxations
      .filter((r) => r.admits > 0)
      .sort((a, b) => b.admits - a.admits || (a.requirement < b.requirement ? -1 : 1)),
  };
};
