export type LineageKind =
  | 'input'
  | 'claim'
  | 'derivation'
  | 'constraint'
  | 'aggregation';

export interface LineageNode {
  nodeId: string;
  kind: LineageKind;
  label: string;
  contribution?: number;
  confidence?: number;
  sourceRef?: { sourceId: string; reliability: number; observedAt: string };
  conflictId?: string;
  children: LineageNode[];
}

export function countLineage(node: LineageNode): number {
  return 1 + node.children.reduce((s, c) => s + countLineage(c), 0);
}

/** Depth-first, pre-order — the order the surface renders in. */
export function* walkLineage(node: LineageNode): Generator<LineageNode> {
  yield node;
  for (const child of node.children) yield* walkLineage(child);
}

export function contestedConflictIds(node: LineageNode): string[] {
  const out = new Set<string>();
  for (const n of walkLineage(node)) if (n.conflictId) out.add(n.conflictId);
  return [...out].sort();
}
