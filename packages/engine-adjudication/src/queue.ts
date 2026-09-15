import type { ConflictGroup } from './conflict.js';
import type { QuarantineRecord } from '@camefa/engine-ingest';

/**
 * ADR-062: queue order is expected decision impact, not recency or severity.
 * Human review is the scarcest input the system has; ordering by anything else
 * spends it on facts nobody will ever ask about.
 */
export type QueueItem = {
  readonly itemId: string;
  readonly kind: 'conflict' | 'quarantine';
  readonly entityId: string | null;
  readonly attributeKey: string;
  /** Expected number of future decisions this item currently corrupts. */
  readonly affectedDecisions: number;
  /** 0..1 — how much resolving this reduces model uncertainty. */
  readonly informationGain: number;
  /** Estimated reviewer seconds. Cheap-and-valuable sorts above costly-and-valuable. */
  readonly effortSeconds: number;
  readonly priorityScore: number;
  readonly blocksHardGate: boolean;
  readonly payload: ConflictGroup | QuarantineRecord;
};

/** Severity maps to how badly a wrong value distorts a capability. */
const SEVERITY_DISTORTION: Record<ConflictGroup['severity'], number> = {
  noise: 0,
  minor: 0.15,
  material: 0.6,
  contradictory: 1,
};

const EFFORT: Record<string, number> = {
  conflict_quantity: 45,
  conflict_categorical: 90,
  quarantine_ambiguous_match: 120,
  quarantine_type_conflict: 180,
  quarantine_below_match_threshold: 90,
  quarantine_unnormalizable_key: 60,
};

export const prioritize = (args: {
  conflicts: readonly ConflictGroup[];
  quarantined: readonly QuarantineRecord[];
  /** attributeKey → expected monthly decisions touching it (from receipt telemetry). */
  attributeDemand: ReadonlyMap<string, number>;
  /** attributeKey → true when any profile gates hard on it. */
  hardGated: ReadonlySet<string>;
  /** entityId → share of candidate appearances. Obscure gear matters less. */
  entitySalience: ReadonlyMap<string, number>;
}): readonly QueueItem[] => {
  const items: QueueItem[] = [];

  const demandFor = (attributeKey: string) => args.attributeDemand.get(attributeKey) ?? 1;
  const salienceFor = (entityId: string | null) =>
    entityId === null ? 0.1 : args.entitySalience.get(entityId) ?? 0.05;

  for (const c of args.conflicts) {
    const isQuantity = c.claims.every((x) => x.value.kind === 'quantity');
    const distortion = SEVERITY_DISTORTION[c.severity];
    const affected = demandFor(c.attributeKey) * salienceFor(c.entityId) * distortion;

    // A deadlock cannot be broken by more scraping, so human input is the only
    // path forward — that is maximum information gain.
    const gain = c.deadlocked ? 1 : Math.min(1, 0.4 + 0.15 * c.claims.length);

    items.push({
      itemId: c.conflictId,
      kind: 'conflict',
      entityId: c.entityId,
      attributeKey: c.attributeKey,
      affectedDecisions: Number(affected.toFixed(3)),
      informationGain: Number(gain.toFixed(3)),
      effortSeconds: EFFORT[isQuantity ? 'conflict_quantity' : 'conflict_categorical']!,
      priorityScore: 0,
      blocksHardGate: args.hardGated.has(c.attributeKey),
      payload: c,
    });
  }

  for (const q of args.quarantined) {
    // A quarantined draft contributes nothing until cleared, so its full
    // attribute demand is currently unserved.
    const affected = demandFor(q.draft.attributeKey) * 0.5;
    items.push({
      itemId: `${q.rawId}:${q.draft.sourceEntityKey}:${q.draft.attributeKey}`,
      kind: 'quarantine',
      entityId: null,
      attributeKey: q.draft.attributeKey,
      affectedDecisions: Number(affected.toFixed(3)),
      // Clearing one ambiguous key usually unblocks every draft sharing it.
      informationGain: q.outcome.reason === 'ambiguous_match' ? 0.9 : 0.6,
      effortSeconds: EFFORT[`quarantine_${q.outcome.reason}`] ?? 90,
      priorityScore: 0,
      blocksHardGate: args.hardGated.has(q.draft.attributeKey),
      payload: q,
    });
  }

  return items
    .map((i) => ({
      ...i,
      priorityScore: Number(
        (((i.affectedDecisions * i.informationGain * (i.blocksHardGate ? 4 : 1)) / i.effortSeconds) * 1000).toFixed(4),
      ),
    }))
    .filter((i) => i.priorityScore > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore || (a.itemId < b.itemId ? -1 : 1));
};
