import type { AttributeKey, CapabilityKey, DerivationId } from '@camefa/engine-kernel';
import type { EvidenceClass } from './ports.js';

export type LineageNode =
  | {
      readonly kind: 'claim';
      readonly attribute: AttributeKey;
      readonly evidenceClass: EvidenceClass;
      readonly confidence: number;
      readonly contributing: readonly string[];
      readonly dissenting: readonly string[];
    }
  | {
      readonly kind: 'derivation';
      readonly capability: CapabilityKey;
      readonly derivation: DerivationId;
      readonly version: string;
      readonly strategy: 'primary' | 'fallback';
      readonly confidence: number;
      readonly inputs: readonly LineageNode[];
    };

export const claimIdsOf = (node: LineageNode): readonly string[] =>
  node.kind === 'claim'
    ? node.contributing
    : node.inputs.flatMap(claimIdsOf);

export const weakestEvidence = (node: LineageNode): EvidenceClass => {
  const rank: Record<EvidenceClass, number> = {
    measured: 0, manufacturer: 1, stated: 2, community: 3, inferred: 4,
  };
  const all = node.kind === 'claim' ? [node.evidenceClass] : node.inputs.map(weakestEvidence);
  return all.reduce((a, b) => (rank[a] >= rank[b] ? a : b), 'measured' as EvidenceClass);
};
