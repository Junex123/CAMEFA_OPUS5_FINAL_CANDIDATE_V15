import type { UnitRegistry } from '@camefa/engine-kernel';
import type { Requirement, RequirementOrigin } from './requirement.js';

const PRECEDENCE: Record<RequirementOrigin['kind'], number> = {
  stated: 3, observed: 2, profile: 1, default: 0,
};

export interface MergeConflict {
  readonly capability: string;
  readonly kept: string;
  readonly overridden: readonly string[];
}

/**
 * One requirement per (capability, op-family). Higher-precedence origins win
 * outright; equal precedence keeps the stricter target and the higher weight.
 * Blocking hardness is never downgraded by a lower-precedence source.
 */
export const mergeRequirements = (
  requirements: readonly Requirement[],
  units: UnitRegistry,
): { readonly merged: readonly Requirement[]; readonly conflicts: readonly MergeConflict[] } => {
  const family = (r: Requirement) =>
    `${r.capability}:${r.op === 'maximize' || r.op === 'minimize' ? 'relative' : 'threshold'}`;

  const buckets = new Map<string, Requirement[]>();
  for (const r of requirements) {
    const key = family(r);
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }

  const merged: Requirement[] = [];
  const conflicts: MergeConflict[] = [];

  for (const [, group] of [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) => PRECEDENCE[b.origin.kind] - PRECEDENCE[a.origin.kind] || (a.id < b.id ? -1 : 1),
    );
    const top = sorted[0]!;
    const peers = sorted.filter((r) => PRECEDENCE[r.origin.kind] === PRECEDENCE[top.origin.kind]);

    let winner = top;
    for (const peer of peers.slice(1)) {
      winner = stricter(winner, peer, units);
    }
    // A blocking gate from any source survives; user precedence can relax it
    // only through an explicit correction signal, not by mere restatement.
    const anyBlocking = group.some((r) => r.hardness === 'blocking');
    const finalReq: Requirement = {
      ...winner,
      hardness: anyBlocking ? 'blocking' : winner.hardness,
      weight: Math.max(...group.map((r) => r.weight)),
    };
    merged.push(finalReq);
    conflicts.push({
      capability: winner.capability,
      kept: winner.id,
      overridden: group.filter((r) => r.id !== winner.id).map((r) => r.id),
    });
  }

  return { merged, conflicts };
};

const stricter = (a: Requirement, b: Requirement, units: UnitRegistry): Requirement => {
  if (a.target?.kind !== 'quantity' || b.target?.kind !== 'quantity') return a;
  const cmp = units.compare(a.target.value, b.target.value);
  if (!cmp.ok) return a;
  if (a.op === 'gte') return cmp.value >= 0 ? a : b;
  if (a.op === 'lte') return cmp.value <= 0 ? a : b;
  return a;
};
