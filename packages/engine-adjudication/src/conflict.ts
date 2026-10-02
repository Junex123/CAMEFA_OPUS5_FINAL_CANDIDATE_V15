import { attributeKey, isQuantity, type Quantity } from '@camefa/engine-kernel';
import { contentHash } from '@camefa/engine-kernel';
import type { Claim } from '@camefa/engine-contracts';
import type { CompiledOntology } from '@camefa/engine-ontology';

/**
 * ADR-061: conflict detection must not invent precision that the ontology does
 * not declare. V19 attributes carry value types and canonical units, but they
 * do not carry an attribute-level JND. Quantity disagreements are therefore
 * fail-closed: equal values after canonical conversion are not conflicts;
 * unequal values are material conflicts until an explicit attribute JND policy
 * is added to the ontology. Categorical disagreements remain contradictory.
 */
export type ConflictSeverity = 'noise' | 'minor' | 'material' | 'contradictory';

export type ConflictGroup = {
  readonly conflictId: string;
  readonly entityId: string;
  readonly attributeKey: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly severity: ConflictSeverity;
  /** Reserved for a future explicit attribute-level JND policy. */
  readonly spreadJnd: number | null;
  readonly claims: readonly Claim[];
  readonly deadlocked: boolean;
};

const quantityOf = (value: unknown): Quantity | null => {
  if (
    typeof value !== 'object' || value === null ||
    !('kind' in value) || value.kind !== 'quantity' ||
    !('value' in value) || !('unit' in value) ||
    typeof value.value !== 'number' || typeof value.unit !== 'string'
  ) return null;

  return { value: value.value, unit: value.unit as Quantity['unit'] };
};

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
    if (c.retractedAt !== null && c.retractedAt !== undefined) continue;
    const k = `${c.entityId}\u0000${c.attributeKey}`;
    (byTarget.get(k) ?? byTarget.set(k, []).get(k)!).push(c);
  }

  const out: ConflictGroup[] = [];

  for (const [, group] of byTarget) {
    const attribute = ontology.attributes.get(attributeKey(group[0]!.attributeKey));
    if (!attribute) continue;

    const windows: Claim[][] = [];
    for (const c of group.sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom))) {
      const w = windows.find((win) => win.every((x) => overlaps(x, c)));
      if (w) w.push(c);
      else windows.push([c]);
    }

    for (const window of windows) {
      const sources = new Set(window.map((c) => c.sourceId));
      if (window.length < 2 || sources.size < 2) continue;

      const quantities = window.map((c) => quantityOf(c.value));
      let severity: ConflictSeverity;
      let spreadJnd: number | null = null;

      if (quantities.every((q): q is Quantity => q !== null) && attribute.valueType.kind === 'quantity') {
        const canonical: number[] = [];
        let conversionFailed = false;

        for (const quantity of quantities) {
          const converted = ontology.units.convert(quantity, attribute.valueType.canonicalUnit);
          if (!converted.ok) {
            conversionFailed = true;
            break;
          }
          canonical.push(converted.value.value);
        }

        if (!conversionFailed && canonical.every((value, i) => value === canonical[0] || i === 0)) {
          continue;
        }

        // V19 has no attribute-level JND, so the safe behavior is to surface a
        // real disagreement instead of silently treating it as measurement
        // noise. The future ontology policy can populate spreadJnd.
        severity = 'material';
      } else {
        const distinct = new Set(window.map((c) => JSON.stringify(c.value)));
        if (distinct.size < 2) continue;
        severity = 'contradictory';
      }

      const votes = new Map<string, Set<string>>();
      for (const c of window) {
        const k = JSON.stringify(c.value);
        (votes.get(k) ?? votes.set(k, new Set()).get(k)!).add(c.sourceId);
      }

      const tallies = [...votes.values()].map((s) => s.size).sort((a, b) => b - a);
      const deadlocked = tallies.length > 1 && tallies[0]! === tallies[1]!;

      const claimsSorted = [...window].sort((a, b) => (a.id < b.id ? -1 : 1));
      out.push({
        conflictId: contentHash({
          e: group[0]!.entityId,
          a: group[0]!.attributeKey,
          c: claimsSorted.map((c) => c.id),
        }),
        entityId: group[0]!.entityId,
        attributeKey: group[0]!.attributeKey,
        validFrom: window.reduce((m, c) => (c.validFrom < m ? c.validFrom : m), window[0]!.validFrom),
        validTo: window.some((c) => c.validTo === null)
          ? null
          : window.reduce<string | null>(
              (m, c) => (m === null || (c.validTo && c.validTo > m) ? c.validTo! : m),
              null,
            ),
        severity,
        spreadJnd,
        claims: claimsSorted,
        deadlocked,
      });
    }
  }

  return out.sort((a, b) => (a.conflictId < b.conflictId ? -1 : 1));
};
