import type { RankRow } from '@camefa/engine-contracts';

const ARROW: Record<RankRow['movement'], string> = {
  up: '▲',
  down: '▼',
  held: '–',
  entered: '+',
  left: '−',
  eliminated: '⊘',
  revived: '↺',
};

export function DiffTable({ rows }: { rows: RankRow[] }) {
  return (
    <table className="diffrows">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">Candidate</th>
          <th scope="col">Rank A</th>
          <th scope="col">Rank B</th>
          <th scope="col">Δ score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.entityId} className={`mv mv--${r.movement}`}>
            <td className="mv__glyph" title={r.movement}>
              {ARROW[r.movement]}
            </td>
            <td>{r.label}</td>
            <td>{r.rankA ?? '—'}</td>
            <td>{r.rankB ?? '—'}</td>
            <td className="num">
              {r.scoreDelta === null
                ? '—'
                : `${r.scoreDelta >= 0 ? '+' : ''}${r.scoreDelta.toFixed(3)}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
