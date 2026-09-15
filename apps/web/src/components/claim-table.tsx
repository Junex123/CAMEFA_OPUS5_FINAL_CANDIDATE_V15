import type { PublicConflict } from '@/lib/conflict-types';

export function ClaimTable({ conflict }: { conflict: PublicConflict }) {
  const accepted = new Set(conflict.resolution?.acceptedClaimIds ?? []);
  const rejected = new Set(conflict.resolution?.rejectedClaimIds ?? []);

  return (
    <table className="claims">
      <thead>
        <tr>
          <th scope="col">Value</th>
          <th scope="col">Source</th>
          <th scope="col">Reliability</th>
          <th scope="col">Observed</th>
          <th scope="col">Flags</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {conflict.claims.map((c) => {
          const state = accepted.has(c.claimId)
            ? 'accepted'
            : rejected.has(c.claimId)
              ? 'rejected'
              : 'undecided';
          return (
            <tr key={c.claimId} className={`claims__row--${state}`}>
              <td className="val">
                {String(c.value)}
                {c.unit ? ` ${c.unit}` : ''}
              </td>
              <td>{c.sourceId}</td>
              <td>
                <span className="bar">
                  <span
                    className="bar__fill"
                    style={{ width: `${c.sourceReliability * 100}%` }}
                  />
                  <span className="bar__num">{c.sourceReliability.toFixed(2)}</span>
                </span>
              </td>
              <td>{c.observedAt.slice(0, 10)}</td>
              <td>
                {c.outlierFlags.length === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  c.outlierFlags.map((f) => (
                    <span key={f} className="tag">
                      {f}
                    </span>
                  ))
                )}
              </td>
              <td>
                {state}
                {c.withinJndOfAccepted && (
                  <span className="muted"> (within JND)</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
