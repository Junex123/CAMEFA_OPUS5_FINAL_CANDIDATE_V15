import type { AttributeKey, CapabilityKey, DerivationId } from './primitives.js';

export type EvidenceClass = 'measured' | 'manufacturer' | 'community' | 'stated' | 'inferred';
export type LineageNode =
  | { readonly kind: 'claim'; readonly attribute: AttributeKey; readonly evidenceClass: EvidenceClass; readonly confidence: number; readonly contributing: readonly string[]; readonly dissenting: readonly string[] }
  | { readonly kind: 'derivation'; readonly capability: CapabilityKey; readonly derivation: DerivationId; readonly version: string; readonly strategy: 'primary' | 'fallback'; readonly confidence: number; readonly inputs: readonly LineageNode[] }
  | { readonly kind: 'aggregation' | 'constraint'; readonly nodeId: string; readonly label: string; readonly contribution?: number; readonly confidence?: number; readonly children: readonly LineageNode[] };

export function countLineage(node: LineageNode): number {
  if (node.kind === 'claim') return 1;
  if (node.kind === 'derivation') return 1 + node.inputs.reduce((n, child) => n + countLineage(child), 0);
  return 1 + node.children.reduce((n, child) => n + countLineage(child), 0);
}
export function* walkLineage(node: LineageNode): Generator<LineageNode> {
  yield node;
  if (node.kind === 'derivation') for (const child of node.inputs) yield* walkLineage(child);
  else if (node.kind === 'aggregation' || node.kind === 'constraint') for (const child of node.children) yield* walkLineage(child);
}
export function claimIdsOf(node: LineageNode): readonly string[] {
  if (node.kind === 'claim') return node.contributing;
  if (node.kind === 'derivation') return node.inputs.flatMap(claimIdsOf);
  return node.children.flatMap(claimIdsOf);
}
export function contestedConflictIds(_node: LineageNode): readonly string[] { return []; }
