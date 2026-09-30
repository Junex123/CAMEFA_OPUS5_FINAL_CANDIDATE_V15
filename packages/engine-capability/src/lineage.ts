import type { LineageNode } from '@camefa/engine-contracts';
import type { EvidenceClass } from './ports.js';

export type { LineageNode };

export const claimIdsOf = (node: LineageNode): readonly string[] =>
  node.kind === 'claim'
    ? node.contributing
    : node.kind === 'derivation'
      ? node.inputs.flatMap(claimIdsOf)
      : node.children.flatMap(claimIdsOf);

export const weakestEvidence = (node: LineageNode): EvidenceClass => {
  const rank: Record<EvidenceClass, number> = {
    measured: 0, manufacturer: 1, stated: 2, community: 3, inferred: 4,
  };
  const all = node.kind === 'claim'
    ? [node.evidenceClass]
    : node.kind === 'derivation'
      ? node.inputs.map(weakestEvidence)
      : node.children.map(weakestEvidence);
  return all.reduce((a, b) => (rank[a] >= rank[b] ? a : b), 'measured' as EvidenceClass);
};
