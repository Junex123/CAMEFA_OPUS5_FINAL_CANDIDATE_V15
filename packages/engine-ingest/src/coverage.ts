/**
 * ADR-059: coverage is measured by decision impact, not by cell fill rate. A
 * 95%-complete graph that is missing card-slot counts cannot answer a wedding
 * question at all, while one missing sensor type answers nearly everything.
 */
export type CoverageGap = {
  readonly attributeKey: string;
  readonly missingEntities: number;
  /** Profiles whose requirements depend on this attribute, transitively. */
  readonly blockedProfiles: readonly string[];
  /** Requirements gated hard on it — these produce indeterminate verdicts. */
  readonly hardGateCount: number;
  readonly impactScore: number;
  readonly priority: 1 | 2 | 3;
};

export const rankCoverageGaps = (args: {
  /** attributeKey → count of entities lacking any claim. */
  missing: ReadonlyMap<string, number>;
  /** attributeKey → capability keys that consume it. */
  attributeToCapabilities: ReadonlyMap<string, readonly string[]>;
  /** capabilityKey → { profileId, hard, weight } demands. */
  capabilityDemand: ReadonlyMap<string, readonly { profileId: string; hard: boolean; weight: number }[]>;
  /** profileId → observed share of real user sessions. */
  profileTraffic: ReadonlyMap<string, number>;
}): readonly CoverageGap[] => {
  const gaps: CoverageGap[] = [];

  for (const [attributeKey, missingEntities] of args.missing) {
    if (missingEntities === 0) continue;

    const profiles = new Set<string>();
    let hardGateCount = 0;
    let demandWeight = 0;

    for (const capability of args.attributeToCapabilities.get(attributeKey) ?? []) {
      for (const demand of args.capabilityDemand.get(capability) ?? []) {
        profiles.add(demand.profileId);
        if (demand.hard) hardGateCount += 1;
        // Traffic-weighted: a gap in a profile nobody uses is not urgent.
        const traffic = args.profileTraffic.get(demand.profileId) ?? 0.01;
        demandWeight += demand.weight * traffic * (demand.hard ? 3 : 1);
      }
    }

    const impactScore = Number((demandWeight * Math.log1p(missingEntities)).toFixed(4));
    gaps.push({
      attributeKey,
      missingEntities,
      blockedProfiles: [...profiles].sort(),
      hardGateCount,
      impactScore,
      priority: hardGateCount > 0 ? 1 : impactScore > 1 ? 2 : 3,
    });
  }

  return gaps.sort((a, b) => a.priority - b.priority || b.impactScore - a.impactScore);
};
