export interface SyntheticEntity {
  entityId: string;
  label: string;
  /** Where the synthetic id is referenced outside the graph. */
  referencedBy: { goldenQuestions: string[]; anchors: string[]; profiles: string[] };
}

export interface RealEntity {
  entityId: string;
  label: string;
  claimCount: number;
  attributesCovered: string[];
}

export interface RetirementPlan {
  aliases: { from: string; to: string }[];
  orphanedSynthetics: string[];
  danglingReferences: { entityId: string; referencedBy: string[] }[];
  /** Real entities too thin to stand in for a synthetic seed. */
  underCovered: { entityId: string; missing: string[] }[];
  safe: boolean;
}

export class RetirementError extends Error {}

/**
 * Synthetic ids leak into golden questions, anchors and profile examples.
 * Deleting seeds without an alias map silently rewrites what the gate is
 * asserting, so the plan refuses to be "safe" while any reference dangles.
 */
export function planRetirement(
  synthetics: readonly SyntheticEntity[],
  reals: readonly RealEntity[],
  mapping: Readonly<Record<string, string>>,
  requiredAttributes: readonly string[],
): RetirementPlan {
  const realById = new Map(reals.map((r) => [r.entityId, r]));
  const aliases: RetirementPlan['aliases'] = [];
  const orphaned: string[] = [];
  const dangling: RetirementPlan['danglingReferences'] = [];
  const underCovered: RetirementPlan['underCovered'] = [];

  for (const s of synthetics) {
    const target = mapping[s.entityId];
    const refs = [
      ...s.referencedBy.goldenQuestions,
      ...s.referencedBy.anchors,
      ...s.referencedBy.profiles,
    ];

    if (!target) {
      if (refs.length > 0) dangling.push({ entityId: s.entityId, referencedBy: refs });
      else orphaned.push(s.entityId);
      continue;
    }

    const real = realById.get(target);
    if (!real) {
      throw new RetirementError(
        `${s.entityId} maps to ${target}, which does not exist in the real corpus`,
      );
    }

    const missing = requiredAttributes.filter(
      (a) => !real.attributesCovered.includes(a),
    );
    if (missing.length > 0) underCovered.push({ entityId: real.entityId, missing });

    aliases.push({ from: s.entityId, to: target });
  }

  return {
    aliases,
    orphanedSynthetics: orphaned,
    danglingReferences: dangling,
    underCovered,
    safe: dangling.length === 0 && underCovered.length === 0,
  };
}

/** Production guard, tightened: aliases are allowed, live synthetics are not. */
export function assertNoSyntheticClaims(
  claims: readonly { entityId: string; sourceId: string }[],
): void {
  const bad = claims.filter(
    (c) => c.sourceId.startsWith('src:synthetic') || c.entityId.startsWith('syn:'),
  );
  if (bad.length > 0) {
    throw new RetirementError(
      `${bad.length} synthetic claim(s) reached the graph; first: ${bad[0]!.entityId}`,
    );
  }
}
