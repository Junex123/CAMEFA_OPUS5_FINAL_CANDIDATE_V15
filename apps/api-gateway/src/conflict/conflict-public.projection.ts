import type { ConflictRecord, ClaimView } from '@camefa/engine-adjudication';

/**
 * Public projection. Reviewer identity never leaves the admin boundary
 * (ADR-064); only a stable pseudonym and calibration band are exposed.
 */
export interface PublicConflict {
  conflictId: string;
  slot: { entityId: string; entityLabel: string; attribute: string; window: string };
  status: 'open' | 'in_review' | 'resolved' | 'quarantined';
  compositionHash: string;
  isAnchored: boolean;
  jndThreshold: number | null;
  claims: PublicClaim[];
  resolution: PublicResolution | null;
  affectedDecisions: number;
  openedAt: string;
}

export interface PublicClaim {
  claimId: string;
  value: unknown;
  unit: string | null;
  sourceId: string;
  sourceReliability: number;
  observedAt: string;
  outlierFlags: string[];
  withinJndOfAccepted: boolean;
}

export interface PublicResolution {
  acceptedClaimIds: string[];
  rejectedClaimIds: string[];
  basis: 'anchor_measurement' | 'source_reliability' | 'reviewer_judgement' | 'escalation';
  note: string | null;
  reviewerPseudonym: string;
  reviewerBand: 'high' | 'medium' | 'low';
  kappaAnchored: number | null;
  resolvedAt: string;
}

const band = (kappa: number | null): PublicResolution['reviewerBand'] =>
  kappa === null ? 'low' : kappa >= 0.75 ? 'high' : kappa >= 0.5 ? 'medium' : 'low';

export function projectConflict(
  record: ConflictRecord,
  claims: ClaimView[],
  affectedDecisions: number,
): PublicConflict {
  const accepted = new Set(record.resolution?.acceptedClaimIds ?? []);

  return {
    conflictId: record.conflictId,
    slot: {
      entityId: record.slot.entityId,
      entityLabel: record.slot.entityLabel,
      attribute: record.slot.attribute,
      window: record.slot.window,
    },
    // A live lease is an internal scheduling detail; surface it as in_review.
    status: record.lease && record.status === 'open' ? 'in_review' : record.status,
    compositionHash: record.compositionHash,
    isAnchored: record.anchor !== null,
    jndThreshold: record.jnd?.threshold ?? null,
    claims: claims.map((c) => ({
      claimId: c.claimId,
      value: c.value,
      unit: c.unit ?? null,
      sourceId: c.sourceId,
      sourceReliability: Number(c.reliabilityAtRead.toFixed(3)),
      observedAt: c.observedAt,
      outlierFlags: c.outlierFlags ?? [],
      withinJndOfAccepted:
        accepted.size > 0 && !accepted.has(c.claimId)
          ? (c.jndDistanceToAccepted ?? Infinity) <= (record.jnd?.threshold ?? 0)
          : false,
    })),
    resolution: record.resolution
      ? {
          acceptedClaimIds: record.resolution.acceptedClaimIds,
          rejectedClaimIds: record.resolution.rejectedClaimIds,
          basis: record.resolution.basis,
          note: record.resolution.publicNote ?? null,
          reviewerPseudonym: record.resolution.reviewerPseudonym,
          reviewerBand: band(record.resolution.kappaAnchored ?? null),
          kappaAnchored: record.resolution.kappaAnchored ?? null,
          resolvedAt: record.resolution.resolvedAt,
        }
      : null,
    affectedDecisions,
    openedAt: record.openedAt,
  };
}
