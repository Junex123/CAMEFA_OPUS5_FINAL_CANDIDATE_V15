import type { CostSink } from '@camefa/engine-kernel';
import type { EvidenceRef } from '@camefa/engine-capability';

export interface AttributeValue {
  value: number;
  unit: string;
  evidence: EvidenceRef[];
  confidence: number;
  derived: boolean;
  derivationId: string | null;
  /** Set when the underlying slot is contested (ADR-061). */
  conflictId: string | null;
  /** True when the value was imputed rather than observed (ADR-076). */
  imputed: boolean;
  outlierFlags: string[];
}

export interface Candidate {
  entityId: string;
  label: string;
  entityType: string;
  values: Map<string, AttributeValue>;
}

export interface ClaimRow {
  claimId: string;
  entityId: string;
  entityLabel: string;
  entityType: string;
  attribute: string;
  value: number;
  unit: string;
  sourceId: string;
  reliability: number;
  conflictId: string | null;
  outlierFlags: string[];
}

export interface DerivedRow {
  entityId: string;
  attribute: string;
  value: number;
  unit: string;
  derivationId: string;
  evidence: EvidenceRef[];
  confidence: number;
}

/**
 * Collapses many claims per slot into one value. Where a slot is contested the
 * highest-reliability claim wins for scoring purposes, but the conflictId is
 * retained so the receipt can say the value is disputed and the leverage
 * analysis can say whether that dispute matters.
 */
export function assembleCandidates(
  claims: readonly ClaimRow[],
  derived: readonly DerivedRow[],
  sink: CostSink,
): Candidate[] {
  const byEntity = new Map<string, Candidate>();

  for (const row of claims) {
    sink.charge('evidenceReads', 1);
    let candidate = byEntity.get(row.entityId);
    if (!candidate) {
      candidate = {
        entityId: row.entityId,
        label: row.entityLabel,
        entityType: row.entityType,
        values: new Map(),
      };
      byEntity.set(row.entityId, candidate);
    }

    const existing = candidate.values.get(row.attribute);
    const ref: EvidenceRef = {
      claimId: row.claimId,
      entityId: row.entityId,
      attribute: row.attribute,
      sourceId: row.sourceId,
      reliability: row.reliability,
    };

    if (!existing) {
      candidate.values.set(row.attribute, {
        value: row.value,
        unit: row.unit,
        evidence: [ref],
        confidence: row.reliability,
        derived: false,
        derivationId: null,
        conflictId: row.conflictId,
        imputed: false,
        outlierFlags: row.outlierFlags,
      });
      continue;
    }

    const incumbent = existing.evidence.reduce((m, e) => Math.max(m, e.reliability), 0);
    const takeover = row.reliability > incumbent;
    existing.evidence = [...existing.evidence, ref].sort((a, b) =>
      a.claimId.localeCompare(b.claimId),
    );
    existing.conflictId = existing.conflictId ?? row.conflictId;
    existing.outlierFlags = [...new Set([...existing.outlierFlags, ...row.outlierFlags])].sort();
    if (takeover) {
      existing.value = row.value;
      existing.unit = row.unit;
    }
    // Corroboration across distinct sources (ADR-075).
    const bySource = new Map<string, number>();
    for (const e of existing.evidence) {
      bySource.set(e.sourceId, Math.max(bySource.get(e.sourceId) ?? 0, e.reliability));
    }
    let unreliability = 1;
    for (const r of bySource.values()) unreliability *= 1 - Math.min(1, Math.max(0, r));
    existing.confidence = 1 - unreliability;
  }

  for (const row of derived) {
    const candidate = byEntity.get(row.entityId);
    if (!candidate) continue;
    candidate.values.set(row.attribute, {
      value: row.value,
      unit: row.unit,
      evidence: row.evidence,
      confidence: row.confidence,
      derived: true,
      derivationId: row.derivationId,
      conflictId: row.evidence.find((e) => e.claimId)?.claimId ? null : null,
      imputed: false,
      outlierFlags: [],
    });
  }

  return [...byEntity.values()].sort((a, b) => a.entityId.localeCompare(b.entityId));
}
