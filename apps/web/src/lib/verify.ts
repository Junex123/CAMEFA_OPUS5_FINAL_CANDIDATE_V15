import { canonicalHash, type DecisionReceipt } from '@camefa/engine-contracts';

export interface Verification {
  addressMatches: boolean;
  computed: string;
  replayable: boolean;
  reasons: string[];
}

/** Recomputes the content address so the surface never trusts the store. */
export function verifyReceipt(r: DecisionReceipt): Verification {
  const { receiptId, ...payload } = r;
  const computed = canonicalHash(payload);
  const reasons: string[] = [];

  if (computed !== receiptId) reasons.push('content address mismatch');
  if (!r.engine?.calibrationRef) reasons.push('missing calibrationRef (ADR-051)');
  if (!r.engine?.ontologyFingerprint) reasons.push('missing ontology fingerprint');
  if (!r.engine?.reliabilityFingerprint)
    reasons.push('missing reliability fingerprint (ADR-058)');

  return {
    addressMatches: computed === receiptId,
    computed,
    replayable: reasons.length === 0,
    reasons,
  };
}
