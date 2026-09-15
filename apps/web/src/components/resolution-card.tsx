import type { PublicConflict } from '@/lib/conflict-types';

const BASIS_COPY: Record<string, string> = {
  anchor_measurement: 'Decided by an independent measurement.',
  source_reliability: 'Decided by read-time source reliability (ADR-058).',
  reviewer_judgement: 'Decided by a human reviewer under blind presentation (ADR-063).',
  escalation: 'Escalated beyond the reviewer pool.',
};

export function ResolutionCard({ conflict }: { conflict: PublicConflict }) {
  const r = conflict.resolution;

  if (!r) {
    return (
      <p className="muted">
        Unresolved. Decisions touching this slot are computed from the remaining
        uncontested evidence and their confidence is discounted accordingly; the
        engine does not pick a winner on the reader&apos;s behalf.
      </p>
    );
  }

  return (
    <div className="resolution">
      <dl className="triplet">
        <div>
          <dt>basis</dt>
          <dd>
            {r.basis} <span className="muted">— {BASIS_COPY[r.basis]}</span>
          </dd>
        </div>
        <div>
          <dt>reviewer</dt>
          <dd>
            <code>{r.reviewerPseudonym}</code>{' '}
            <span className={`dot dot--${r.reviewerBand === 'high' ? 'good' : r.reviewerBand === 'medium' ? 'warn' : 'bad'}`} />
            {r.reviewerBand} agreement
            {r.kappaAnchored !== null && ` (κ_anchored ${r.kappaAnchored.toFixed(2)})`}
          </dd>
        </div>
        <div>
          <dt>resolved</dt>
          <dd>{new Date(r.resolvedAt).toISOString()}</dd>
        </div>
      </dl>
      {r.note && <blockquote className="note">{r.note}</blockquote>}
    </div>
  );
}
