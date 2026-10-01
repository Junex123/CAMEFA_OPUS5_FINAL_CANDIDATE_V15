import type { RankRow } from '@camefa/engine-contracts';

const ARROW: Record<RankRow['movement'], string> = { up: '▲', down: '▼', held: '–', entered: '+', left: '−' };

export function DiffTable({ rows }: { rows: RankRow[] }) {
  return <table className="diffrows"><thead><tr><th /><th>Candidate</th><th>Rank A</th><th>Rank B</th><th>Δ score</th></tr></thead><tbody>
    {rows.map((r) => <tr key={r.slot} className={`mv mv--${r.movement}`}><td>{ARROW[r.movement]}</td><td>{r.slot}</td><td>{r.rankA ?? '—'}</td><td>{r.rankB ?? '—'}</td><td>{r.scoreDelta === null ? '—' : r.scoreDelta.toFixed(3)}</td></tr>)}
  </tbody></table>;
}
