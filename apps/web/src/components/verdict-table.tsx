import type { DecisionOutcome } from '@camefa/engine-contracts';

export function VerdictTable({ outcome }: { outcome: DecisionOutcome }) {
  return (
    <table className="verdict">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Candidate</th>
          <th scope="col">Fit</th>
          <th scope="col">Binding constraint</th>
          <th scope="col">Confidence</th>
        </tr>
      </thead>
      <tbody>
        {outcome.ranked.map((row, i) => (
          <tr key={row.entityId} className={row.eliminated ? 'is-out' : ''}>
            <td>{row.eliminated ? '—' : i + 1}</td>
            <td>
              <span className="name">{row.label}</span>
              {row.eliminated && <span className="tag">eliminated</span>}
            </td>
            <td>
              <Bar value={row.score} />
            </td>
            <td>
              {row.binding
                ? `${row.binding.requirement} (${row.binding.margin >= 0 ? '+' : ''}${row.binding.margin.toFixed(2)})`
                : '—'}
            </td>
            <td>
              <ConfidenceDot value={row.confidence} />
              {(row.confidence * 100).toFixed(0)}%
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className="bar" aria-label={`${pct.toFixed(0)} of 100`}>
      <span className="bar__fill" style={{ width: `${pct}%` }} />
      <span className="bar__num">{value.toFixed(3)}</span>
    </span>
  );
}

function ConfidenceDot({ value }: { value: number }) {
  const tone = value >= 0.8 ? 'good' : value >= 0.55 ? 'warn' : 'bad';
  return <i className={`dot dot--${tone}`} aria-hidden="true" />;
}
