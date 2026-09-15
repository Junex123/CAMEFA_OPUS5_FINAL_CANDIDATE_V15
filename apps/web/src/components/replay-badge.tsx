import type { Verification } from '@/lib/verify';

export function ReplayBadge({
  verification,
  declared,
}: {
  verification: Verification;
  declared: boolean;
}) {
  const drift = declared !== verification.replayable;
  const tone = !verification.addressMatches
    ? 'bad'
    : verification.replayable
      ? 'good'
      : 'warn';

  return (
    <div className={`badge badge--${tone}`} role="status">
      <strong>
        {!verification.addressMatches
          ? 'Tampered'
          : verification.replayable
            ? 'Replayable'
            : 'Not replayable'}
      </strong>
      {verification.reasons.length > 0 && (
        <ul>
          {verification.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {drift && (
        <p className="badge__drift">
          Store declared <code>replayable={String(declared)}</code>; surface
          computed <code>{String(verification.replayable)}</code>. Surface wins.
        </p>
      )}
    </div>
  );
}
