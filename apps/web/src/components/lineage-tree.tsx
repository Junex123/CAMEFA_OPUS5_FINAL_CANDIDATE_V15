import type { LineageNode } from '@/lib/gateway';

const GLYPH: Record<LineageNode['kind'], string> = {
  input: '▸',
  claim: '◆',
  derivation: 'ƒ',
  constraint: '⊘',
  aggregation: 'Σ',
};

export function LineageTree({ node, depth }: { node: LineageNode; depth: number }) {
  const openByDefault = depth < 2;
  const hasKids = node.children.length > 0;

  return (
    <div className="lin" style={{ ['--d' as string]: depth }}>
      {hasKids ? (
        <details open={openByDefault}>
          <summary>
            <Row node={node} />
          </summary>
          {node.children.map((c) => (
            <LineageTree key={c.nodeId} node={c} depth={depth + 1} />
          ))}
        </details>
      ) : (
        <div className="lin__leaf">
          <Row node={node} />
        </div>
      )}
    </div>
  );
}

function Row({ node }: { node: LineageNode }) {
  return (
    <span className={`lin__row lin__row--${node.kind}`}>
      <i className="lin__glyph" aria-hidden="true">
        {GLYPH[node.kind]}
      </i>
      <span className="lin__label">{node.label}</span>
      {node.contribution !== undefined && (
        <span className="lin__contrib">
          {node.contribution >= 0 ? '+' : ''}
          {node.contribution.toFixed(3)}
        </span>
      )}
      {node.sourceRef && (
        <span className="lin__src" title={`observed ${node.sourceRef.observedAt}`}>
          {node.sourceRef.sourceId} · r={node.sourceRef.reliability.toFixed(2)}
        </span>
      )}
      {node.conflictId && (
        <a className="lin__conflict" href={`/conflicts/${node.conflictId}`}>
          contested
        </a>
      )}
    </span>
  );
}
