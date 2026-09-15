import type { LineageNode } from '@camefa/engine-contracts';
import type { AttributeValue } from './candidate.js';
import type { ScoredCandidate, ScoredTerm } from './score.js';

function claimNodes(value: AttributeValue): LineageNode[] {
  return value.evidence.map((e) => ({
    nodeId: `claim:${e.claimId}`,
    kind: 'claim' as const,
    label: `${e.attribute} from ${e.sourceId}`,
    confidence: e.reliability,
    sourceRef: { sourceId: e.sourceId, reliability: e.reliability, observedAt: '' },
    children: [],
  }));
}

function termNode(
  term: ScoredTerm,
  value: AttributeValue | undefined,
): LineageNode {
  const children: LineageNode[] = [];

  if (value?.imputed) {
    children.push({
      nodeId: `imputed:${term.attributeId}`,
      kind: 'input',
      label: `no evidence — imputed at worst observed value (${term.rawValue} ${term.unit})`,
      confidence: 0,
      children: [],
    });
  } else if (value) {
    const inner = claimNodes(value);
    if (value.derived && value.derivationId) {
      children.push({
        nodeId: `derivation:${term.attributeId}`,
        kind: 'derivation',
        label: value.derivationId,
        confidence: value.confidence,
        children: inner,
      });
    } else {
      children.push(...inner);
    }
  }

  return {
    nodeId: `term:${term.requirementId}`,
    kind: 'aggregation',
    label: `${term.requirementId} — ${term.satisfaction.toFixed(3)} satisfied at weight ${term.weight}`,
    contribution: term.contribution,
    confidence: term.confidence,
    ...(term.conflictId ? { conflictId: term.conflictId } : {}),
    children,
  };
}

export function buildLineage(
  questionLabel: string,
  aggregationP: number,
  winner: ScoredCandidate | null,
  values: ReadonlyMap<string, AttributeValue>,
  eliminatedNodes: LineageNode[],
): LineageNode {
  return {
    nodeId: 'root',
    kind: 'aggregation',
    label: `${questionLabel} — non-compensatory power mean (p = ${aggregationP})`,
    children: [
      ...(winner
        ? [
            {
              nodeId: `candidate:${winner.entityId}`,
              kind: 'aggregation' as const,
              label: `${winner.entityId} scored ${winner.score.toFixed(3)}`,
              confidence: winner.confidence,
              children: winner.terms.map((t) => termNode(t, values.get(t.attributeId))),
            },
          ]
        : []),
      ...eliminatedNodes,
    ],
  };
}

export function eliminationNode(
  entityId: string,
  label: string,
  unmet: readonly { requirement: string; margin: number }[],
): LineageNode {
  return {
    nodeId: `eliminated:${entityId}`,
    kind: 'constraint',
    label: `${label} eliminated`,
    children: unmet.map((u) => ({
      nodeId: `unmet:${entityId}:${u.requirement}`,
      kind: 'constraint' as const,
      label: `${u.requirement} unmet by ${Number.isFinite(u.margin) ? u.margin.toFixed(2) : 'no evidence'}`,
      contribution: Number.isFinite(u.margin) ? u.margin : undefined,
      children: [],
    })),
  };
}
