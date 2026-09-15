'use client';

import { useState } from 'react';
import type { AnchorTicket, Reveal } from '@camefa/engine-adjudication';

export function MeasureForm({ ticket }: { ticket: AnchorTicket }) {
  const [measured, setMeasured] = useState('');
  const [instrument, setInstrument] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<Reveal | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/anchors/${ticket.ticketId}/measure`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          measured: Number(measured),
          instrument,
          measuredAt: new Date().toISOString(),
          note: note || null,
        }),
      });
      setResult((await res.json()) as Reveal);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className={`badge badge--${result.surprising ? 'bad' : 'good'}`}>
        <strong>
          {result.surprising ? 'Engine was wrong' : 'Engine agreed'}
        </strong>
        <p>
          Measured <b>{result.measured}</b> {ticket.unit} · engine held{' '}
          <b>{result.predicted}</b> {ticket.unit} · Δ{' '}
          {result.signedError >= 0 ? '+' : ''}
          {result.signedError.toFixed(3)} (JND {result.jnd})
        </p>
        {!result.commitmentValid && (
          <p className="badge__drift">
            Commitment did not verify. The stored prediction was altered after
            the ticket was issued; this measurement must not be promoted to an
            anchor. Report this.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="measure">
      <p className="protocol">{ticket.protocol}</p>
      <p className="muted">
        The engine&apos;s current value is sealed until you submit. Record what
        you measure, not what looks plausible.
      </p>
      <label>
        Measured value {ticket.unit && `(${ticket.unit})`}
        <input
          type="number"
          step="any"
          required
          value={measured}
          onChange={(e) => setMeasured(e.target.value)}
          autoFocus
        />
      </label>
      <label>
        Instrument
        <input
          required
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
          placeholder="e.g. AWS-1000 scale, cal. 2026-04"
        />
      </label>
      <label>
        Note
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit and reveal'}
      </button>
    </form>
  );
}
