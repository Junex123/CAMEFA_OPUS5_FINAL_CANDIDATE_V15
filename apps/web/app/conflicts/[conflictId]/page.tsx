import { notFound } from 'next/navigation';
import { fetchConflict, GatewayError } from '@/lib/gateway';
import { ClaimTable } from '@/components/claim-table';
import { ResolutionCard } from '@/components/resolution-card';

export const revalidate = 30;

const STATUS_COPY: Record<string, string> = {
  open: 'Open — no accepted value; dependent decisions carry reduced confidence.',
  in_review: 'Under review by a calibrated reviewer.',
  resolved: 'Resolved — an accepted value is in force for this window.',
  quarantined:
    'Quarantined — resolution is withheld rather than guessed (ADR-056 fails closed).',
};

export async function generateMetadata({
  params,
}: {
  params: { conflictId: string };
}) {
  return { title: `Conflict · ${decodeURIComponent(params.conflictId)}`, robots: { index: false } };
}

export default async function ConflictPage({
  params,
}: {
  params: { conflictId: string };
}) {
  let conflict;
  try {
    conflict = await fetchConflict(decodeURIComponent(params.conflictId));
  } catch (e) {
    if (e instanceof GatewayError && e.status === 404) notFound();
    throw e;
  }

  const { slot } = conflict;

  return (
    <main className="conflict">
      <header>
        <p className="eyebrow">Contested fact</p>
        <h1>
          {slot.entityLabel} · <span className="attr">{slot.attribute}</span>
        </h1>
        <code className="addr">
          {slot.entityId} / {slot.attribute} / {slot.window}
        </code>
        <div className={`badge badge--${conflict.status === 'resolved' ? 'good' : 'warn'}`}>
          <strong>{conflict.status.replace('_', ' ')}</strong>
          <p className="muted">{STATUS_COPY[conflict.status]}</p>
          {conflict.isAnchored && (
            <p className="anchor">
              Anchored: an independently verified measurement exists for this slot,
              so it also calibrates reviewers (ADR-066).
            </p>
          )}
        </div>
      </header>

      <section aria-labelledby="claims">
        <h2 id="claims">Competing claims</h2>
        {conflict.jndThreshold !== null && (
          <p className="muted">
            Differences within ±{conflict.jndThreshold} {conflict.claims[0]?.unit ?? ''} are
            below the just-noticeable difference for this attribute and are not
            treated as conflicts (ADR-061).
          </p>
        )}
        <ClaimTable conflict={conflict} />
      </section>

      <section aria-labelledby="resolution">
        <h2 id="resolution">Resolution</h2>
        <ResolutionCard conflict={conflict} />
      </section>

      <footer className="muted">
        Slot-addressed: this id is stable as evidence accrues. Claim set
        composition <code>{conflict.compositionHash.slice(0, 12)}…</code> ·
        affects {conflict.affectedDecisions.toLocaleString()} sealed decision
        {conflict.affectedDecisions === 1 ? '' : 's'} · opened{' '}
        {new Date(conflict.openedAt).toISOString().slice(0, 10)}
      </footer>
    </main>
  );
}
