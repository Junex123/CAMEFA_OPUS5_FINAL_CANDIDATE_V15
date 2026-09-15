import { contentHash } from '@camefa/engine-kernel';
import type { Claim } from '@camefa/engine-contracts';
import type { CompiledOntology } from '@camefa/engine-ontology';

/**
 * ADR-061: two sources are only in conflict when they disagree by more than a
 * just-noticeable difference. 737g vs 738g is measurement noise; spending human
 * attention on it is how an adjudication queue dies. The JND already exists in
 * the ontology for scoring, so the same number governs review triage.
 */
export type ConflictSeverity = 'noise' | 'minor' | 'material' | 'contradictory';

export type ConflictGroup = {
  readonly conflictId: string;
  readonly entityId: string;
  readonly attributeKey: string;
  /** Bitemporal window over which the disagreement holds. */
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly severity: ConflictSeverity;
  /** Spread in JND units. Null for non-quantity values. */
  readonly spreadJnd: number | null;
  readonly claims: readonly Claim[];
  /** True when no single value has majority support among distinct sources. */
  readonly deadlocked: boolean;
};

const NOISE_JND = 0.5;
const MINOR_JND = 2;
const MATERIAL_JND = 6;

const severityFor = (jnd: number): ConflictSeverity =>
  jnd <= NOISE_JND ? 'noise' : jnd <= MINOR_JND ? 'minor' : jnd <= MATERIAL_JND ? 'material' : 'contradictory';

/** Overlapping validity windows only: a spec change over time is not a conflict. */
const overlaps = (a: Claim, b: Claim): boolean => {
  const aEnd = a.validTo === null ? Infinity : Date.parse(a.validTo);
  const bEnd = b.validTo === null ? Infinity : Date.parse(b.validTo);
  return Date.parse(a.validFrom) < bEnd && Date.parse(b.validFrom) < aEnd;
};

export const detectConflicts = (
  claims: readonly Claim[],
  ontology: CompiledOntology,
): readonly ConflictGroup[] => {
  const byTarget = new Map<string, Claim[]>();
  for (const c of claims) {
    if (c.retractedAt !== null && c.retractedAt !== undefined) continue; // ADR-022 tombstones
    const k = `${c.entityId}\u0000${c.attributeKey}`;
    (byTarget.get(k) ?? byTarget.set(k, []).get(k)!).push(c);
  }

  const out: ConflictGroup[] = [];

  for (const [, group] of byTarget) {
    const attribute = ontology.attributes.get(group[0]!.attributeKey);
    if (!attribute) continue;

    // Partition into maximal overlapping windows before comparing values.
    const windows: Claim[][] = [];
    for (const c of group.sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom))) {
      const w = windows.find((win) => win.every((x) => overlaps(x, c)));
      if (w) w.push(c);
      else windows.push([c]);
    }

    for (const window of windows) {
      const sources = new Set(window.map((c) => c.sourceId));
      if (window.length < 2 || sources.size < 2) continue;

      let spreadJnd: number | null = null;
      let severity: ConflictSeverity;

      const quantities = window.filter((c) => c.value.kind === 'quantity');
      if (quantities.length === window.length && attribute.jnd !== undefined) {
        // Difference in the unit's native scale — logarithmic units difference
        // by subtraction of exponents, not by ratio (Session 015 fix).
        const canonical = quantities.map((c) =>
          ontology.toCanonical(c.value as { value: number; unit: string }),
        );
        const lo = Math.min(...canonical);
        const hi = Math.max(...canonical);
        spreadJnd = Number(((hi - lo) / attribute.jnd).toFixed(3));
        severity = severityFor(spreadJnd);
      } else {
        const distinct = new Set(window.map((c) => JSON.stringify(c.value)));
        if (distinct.size < 2) continue;
        // Categorical disagreement admits no middle ground.
        severity = 'contradictory';
      }

      if (severity === 'noise') continue;

      // Majority support counted per distinct source, so one prolific scraper
      // cannot outvote three independent measurements.
      const votes = new Map<string, Set<string>>();
      for (const c of window) {
        const k = JSON.stringify(c.value);
        (votes.get(k) ?? votes.set(k, new Set()).get(k)!).add(c.sourceId);
      }
      const tallies = [...votes.values()].map((s) => s.size).sort((a, b) => b - a);
      const deadlocked = tallies.length > 1 && tallies[0]! === tallies[1]!;

      const claimsSorted = [...window].sort((a, b) => (a.id < b.id ? -1 : 1));
      out.push({
        conflictId: contentHash({ e: group[0]!.entityId, a: group[0]!.attributeKey, c: claimsSorted.map((c) => c.id) }),
        entityId: group[0]!.entityId,
        attributeKey: group[0]!.attributeKey,
        validFrom: window.reduce((m, c) => (c.validFrom < m ? c.validFrom : m), window[0]!.validFrom),
        validTo: window.some((c) => c.validTo === null) ? null : window.reduce<string | null>((m, c) => (m === null || (c.validTo && c.validTo > m) ? c.validTo! : m), null),
        severity,
        spreadJnd,
        claims: claimsSorted,
        deadlocked,
      });
    }
  }

  return out.sort((a, b) => (a.conflictId < b.conflictId ? -1 : 1));
};
