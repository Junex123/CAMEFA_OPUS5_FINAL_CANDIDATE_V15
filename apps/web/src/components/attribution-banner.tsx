import type { ReceiptDiff } from '@camefa/engine-contracts';

export function AttributionBanner({ diff }: { diff: ReceiptDiff }) {
  const a = diff.attribution;

  if (a.kind === 'incomparable') {
    return (
      <div className="badge badge--bad">
        <strong>Not comparable</strong>
        <p className="muted">{a.reason}. Ranking movement below is meaningless.</p>
      </div>
    );
  }

  if (a.kind === 'unattributable') {
    return (
      <div className="badge badge--bad">
        <strong>Determinism violation</strong>
        <p className="muted">
          Same question, same ontology, model, calibration, reliability and claim
          set — yet the outcome differs. One of these is true: a version
          dimension is not being captured in the receipt, or the engine has a
          non-deterministic path. Either way the receipts are not replayable and
          this diff should be treated as a bug report, not an explanation.
        </p>
      </div>
    );
  }

  if (a.kind === 'identical') {
    return (
      <div className="badge badge--good">
        <strong>Identical outcome</strong>
        <p className="muted">Replay reproduced the earlier decision exactly.</p>
      </div>
    );
  }

  return (
    <div className={`badge badge--${diff.winnerChanged ? 'warn' : 'good'}`}>
      <strong>
        {diff.winnerChanged ? 'Top recommendation changed' : 'Ordering shifted'}
      </strong>
      <p className="muted">
        Attributable to {a.dimensions.length === 1 ? 'a change in' : 'changes in'}{' '}
        {a.dimensions.join(', ')}.
      </p>
      {a.dimensions.length > 1 && (
        <p className="badge__drift">
          Multiple dimensions moved together, so this diff cannot isolate a
          cause. Re-run with one dimension pinned to attribute it.
        </p>
      )}
    </div>
  );
}
