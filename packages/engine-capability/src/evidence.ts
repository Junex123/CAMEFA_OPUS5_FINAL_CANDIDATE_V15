export interface EvidenceRef {
  claimId: string;
  entityId: string;
  attribute: string;
  sourceId: string;
  /** Read-time reliability (ADR-058), in (0,1]. */
  reliability: number;
}

export type EvidenceSet = readonly EvidenceRef[];

export function unionEvidence(...sets: EvidenceSet[]): EvidenceRef[] {
  const byId = new Map<string, EvidenceRef>();
  for (const set of sets) for (const ref of set) byId.set(ref.claimId, ref);
  return [...byId.values()].sort((a, b) => a.claimId.localeCompare(b.claimId));
}

/**
 * Confidence is computed once from the union of underlying claims — never by
 * multiplying confidences along derivation edges (ADR-075).
 *
 * Two independent sources agreeing on a slot raise confidence in that slot;
 * a derivation is then only as good as its weakest input slot, matching the
 * non-compensatory posture of the aggregation itself. Because the input is a
 * set keyed by claimId, a claim that feeds two branches of a fan-in DAG is
 * counted once.
 */
export function confidenceOf(evidence: EvidenceSet): number {
  if (evidence.length === 0) return 0;

  const bySlot = new Map<string, Map<string, number>>();
  for (const ref of evidence) {
    const slot = `${ref.entityId}|${ref.attribute}`;
    const sources = bySlot.get(slot) ?? new Map<string, number>();
    // Repeat claims from one source are volume, not corroboration (ADR-071).
    const prior = sources.get(ref.sourceId) ?? 0;
    sources.set(ref.sourceId, Math.max(prior, ref.reliability));
    bySlot.set(slot, sources);
  }

  let weakest = 1;
  for (const sources of bySlot.values()) {
    let unreliability = 1;
    for (const r of sources.values()) unreliability *= 1 - Math.min(1, Math.max(0, r));
    weakest = Math.min(weakest, 1 - unreliability);
  }
  return weakest;
}

export function slotsIn(evidence: EvidenceSet): string[] {
  return [...new Set(evidence.map((e) => `${e.entityId}|${e.attribute}`))].sort();
}
