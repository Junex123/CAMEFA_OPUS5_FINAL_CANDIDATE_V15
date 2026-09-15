import type { DecisionReceipt } from '@camefa/engine-contracts';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const TOKEN = process.env.GATEWAY_SERVICE_TOKEN ?? '';

export class GatewayError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string, revalidate: number | false): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
    next: revalidate === false ? { revalidate: false } : { revalidate },
  });
  if (!res.ok) throw new GatewayError(res.status, await res.text());
  return (await res.json()) as T;
}

/** Receipts are content-addressed and immutable → cache forever. */
export const fetchReceipt = (id: string) =>
  get<DecisionReceipt>(`/v1/receipts/${encodeURIComponent(id)}`, false);

export const fetchLineage = (id: string) =>
  get<LineageNode>(`/v1/receipts/${encodeURIComponent(id)}/lineage`, false);

export interface LineageNode {
  nodeId: string;
  kind: 'input' | 'claim' | 'derivation' | 'constraint' | 'aggregation';
  label: string;
  contribution?: number;
  confidence?: number;
  sourceRef?: { sourceId: string; reliability: number; observedAt: string };
  conflictId?: string;
  children: LineageNode[];
}
