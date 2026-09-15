import Link from 'next/link';
import type { LeverageFinding, SensitivityReport } from '@camefa/engine-contracts';

const COPY: Record<SensitivityReport['fragility'], string> = {
  robust:
    'No single requirement weight would have to move by less than ×2 to change the top recommendation. Reasonable disagreement about emphasis does not change this answer.',
  sensitive:
    'A deliberate re-weighting of one requirement — somewhere between ×1.25 and ×2 — would change the top recommendation.',
  knife_edge:
    'A weight nudge under ×1.25 flips the top recommendation. Treat the top candidates as tied; the ordering is more precise than the evidence supports.',
  undetermined: 'No candidate survived the hard constraints.',
};

export function FragilityPanel({
  sensitivity,
  leverage,
}: {
  sensitivity: SensitivityReport;
  leverage: LeverageFinding[];
}) {
  const tone =
    sensitivity.fragility === 'robust'
      ? 'good'
      : sensitivity.fragility === 'sensitive'
        ? 'warn'
        : 'bad';
  const worst = Math.max(
    ...sensitivity.tornado.map((t) => t.nearest?.logDistance ?? 0),
    Math.log(2),
  );
  const decisive = leverage.filter((l) => l.decisive);

  return (
    <>
      <div className={`badge badge--${tone}`} role="status">
        <strong>{sensitivity.fragility.replace('_', ' ')}</strong>
        <p className="muted">{COPY[sensitivity.fragility]}</p>
        {sensitivity.decidedBy && (
          <p className="muted">
            Hinges on <code>{sensitivity.decidedBy}</code> · margin over runner-up{' '}
            {sensitivity.margin.toFixed(3)}
          </p>
        )}
      </div>

      <table className="tornado">
        <thead>
          <tr>
            <th scope="col">Requirement</th>
            <th scope="col">Weight</th>
            <th scope="col">How far it must move to flip the answer</th>
            <th scope="col">Then wins</th>
          </tr>
        </thead>
        <tbody>
          {sensitivity.tornado.map((t) => {
            const d = t.nearest?.logDistance ?? null;
            const pct = d === null ? 100 : Math.min(100, (d / worst) * 100);
            return (
              <tr key={t.requirement} className={d === null ? 'is-inert' : ''}>
                <th scope="row">{t.requirement}</th>
                <td className="num">{t.weight.toFixed(2)}</td>
                <td>
                  <span className="bar">
                    <span
                      className={`bar__fill ${d !== null && d < Math.log(1.25) ? 'bar__fill--hot' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                    <span className="bar__num">
                      {t.nearest
                        ? `${t.nearest.direction === 'up' ? '×' : '÷'}${(t.nearest.direction === 'up' ? t.nearest.lambda : 1 / t.nearest.lambda).toFixed(2)}`
                        : 'never'}
                    </span>
                  </span>
                </td>
                <td>{t.nearest?.challengerId ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {decisive.length > 0 && (
        <div className="badge badge--warn">
          <strong>Contested evidence is load-bearing here</strong>
          <ul>
            {decisive.map((l) => (
              <li key={l.conflictId}>
                <Link href={`/conflicts/${encodeURIComponent(l.conflictId)}`}>
                  {l.entityId} · {l.requirement}
                </Link>{' '}
                — sources disagree by {l.claimSpread.toFixed(3)}, and{' '}
                {l.flipDelta?.toFixed(3)} would change the recommendation
                {l.resolved ? ' (resolved, but the margin is thin)' : ' (unresolved)'}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
