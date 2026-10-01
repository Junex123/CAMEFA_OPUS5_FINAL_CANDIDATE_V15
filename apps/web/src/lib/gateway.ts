import type { DecisionReceipt, ReceiptDiff } from '@camefa/engine-contracts';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const TOKEN = process.env.GATEWAY_SERVICE_TOKEN ?? '';

export class GatewayError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'GatewayError';
  }
}

async function get<T>(path: string, revalidate: number | false): Promise<T> {
  const init: RequestInit & { next?: { revalidate?: number | false } } = {
    headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
  };
  init.next = revalidate === false ? { revalidate: false } : { revalidate };
  const res = await fetch(`${GATEWAY}${path}`, init);
  if (!res.ok) throw new GatewayError(res.status, await res.text());
  return (await res.json()) as T;
}

export const fetchReceipt = (id: string) =>
  get<DecisionReceipt>(`/v1/receipts/${encodeURIComponent(id)}`, false);

export const fetchLineage = async (id: string): Promise<DecisionReceipt['lineage']> =>
  (await fetchReceipt(id)).lineage;

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
export const fetchConflict = (id: string) =>
  get<PublicConflict>(`/v1/conflicts/${encodeURIComponent(id)}`, 30);
export const fetchDiff = (a: string, b: string) =>
  get<ReceiptDiff>(`/v1/receipts/${encodeURIComponent(a)}/diff/${encodeURIComponent(b)}`, false);
