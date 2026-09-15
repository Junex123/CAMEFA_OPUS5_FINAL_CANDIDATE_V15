import type { CostSink } from '@camefa/engine-kernel';
import { confidenceOf, unionEvidence, type EvidenceRef } from './evidence.js';
import { topologicalOrder, type LegacyDerivation } from './derivation.js';

export interface ResolvedValue { entityId: string; attribute: string; value: number; unit: string; evidence: EvidenceRef[]; }
export interface DerivedValue { entityId: string; attribute: string; value: number; unit: string; derivationId: string; evidence: EvidenceRef[]; confidence: number; }
export interface DerivationSkip { entityId: string; derivationId: string; missing: string[]; }
export interface DerivationRunResult { values: DerivedValue[]; skipped: DerivationSkip[]; failed: { entityId: string; derivationId: string; error: string }[]; }

export function runDerivations(inputs: readonly ResolvedValue[], derivations: readonly LegacyDerivation[], sink: CostSink): DerivationRunResult {
  const ordered = topologicalOrder(derivations);
  const entityIds = [...new Set(inputs.map((i) => i.entityId))].sort();
  const values: DerivedValue[] = [];
  const skipped: DerivationSkip[] = [];
  const failed: DerivationRunResult['failed'] = [];
  for (const entityId of entityIds) {
    const slot = new Map<string, { value: number; evidence: EvidenceRef[] }>();
    for (const input of inputs) if (input.entityId === entityId) slot.set(input.attribute, { value: input.value, evidence: input.evidence });
    for (const d of ordered) {
      const missing = d.requires.filter((r) => !slot.has(r));
      if (missing.length) { skipped.push({ entityId, derivationId: d.derivationId, missing }); continue; }
      const used = new Set<string>();
      try { sink.charge('derivations', 1); } catch (e) { failed.push({ entityId, derivationId: d.derivationId, error: e instanceof Error ? e.message : String(e) }); continue; }
      const computed = d.compute({
        has: (attribute) => slot.has(attribute),
        value: (attribute) => { const hit = slot.get(attribute); if (!hit) throw new Error(`${d.derivationId} read undeclared input "${attribute}"`); used.add(attribute); return hit.value; },
      });
      if (!Number.isFinite(computed)) { failed.push({ entityId, derivationId: d.derivationId, error: `produced non-finite value ${computed}` }); continue; }
      const evidence = unionEvidence(...[...used].map((a) => slot.get(a)!.evidence));
      slot.set(d.produces, { value: computed, evidence });
      values.push({ entityId, attribute: d.produces, value: computed, unit: d.unit, derivationId: d.derivationId, evidence, confidence: confidenceOf(evidence) });
    }
  }
  return { values: values.sort((a, b) => a.entityId.localeCompare(b.entityId) || a.attribute.localeCompare(b.attribute)), skipped, failed };
}
