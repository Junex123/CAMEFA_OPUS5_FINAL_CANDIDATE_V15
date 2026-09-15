'use client';

import { useCallback, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { readFrames } from '@/lib/sse';
import {
  initialStreamState,
  reduceStream,
  type StreamState,
} from '@/lib/stream-reducer';

const PROFILES = ['wedding.documentary', 'wildlife.birds', 'travel.light'] as const;

export function DecideConsole() {
  const [state, dispatch] = useReducer(reduceStream, initialStreamState);
  const [profile, setProfile] = useState<string>(PROFILES[0]);
  const [budget, setBudget] = useState<string>('4000');
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          activityProfile: profile,
          constraints: { budgetUsd: Number(budget) },
        }),
        signal: ac.signal,
      });

      try {
        for await (const frame of readFrames(res, ac.signal)) dispatch(frame);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        dispatch({
          t: 'error',
          code: 'transport',
          message: (err as Error).message,
        });
      }
    },
    [profile, budget],
  );

  const busy = state.status === 'open';

  return (
    <>
      <form onSubmit={run} className="decide__form">
        <label>
          Activity
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          Budget (USD)
          <input
            type="number"
            min={0}
            step={50}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Reasoning…' : 'Evaluate'}
        </button>
        {busy && (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        )}
      </form>

      <StageTrack state={state} />
      <PartialView partials={state.partials} />
      <CostMeters cost={state.cost} />

      {state.error && (
        <p className="alert alert--bad">
          <strong>{state.error.code}</strong> {state.error.message}
        </p>
      )}

      {state.receiptId && (
        <p className="alert alert--good">
          Sealed as{' '}
          <Link href={`/r/${state.receiptId}`}>
            <code>{state.receiptId.slice(0, 12)}…</code>
          </Link>
          {state.replayable === false && ' (not replayable)'}
          {state.elapsedMs !== null && ` · ${state.elapsedMs} ms`}
        </p>
      )}
    </>
  );
}

function StageTrack({ state }: { state: StreamState }) {
  if (state.stages.length === 0) return null;
  return (
    <ol className="stages">
      {state.stages.map((s, i) => (
        <li key={`${s.name}-${i}`}>
          <span>{s.name}</span>
          <em>{s.at} ms</em>
        </li>
      ))}
    </ol>
  );
}

function PartialView({ partials }: { partials: Record<string, unknown> }) {
  const rows = Object.entries(partials);
  if (rows.length === 0) return null;
  return (
    <table className="partials">
      <tbody>
        {rows.map(([path, value]) => (
          <tr key={path}>
            <th scope="row">
              <code>{path}</code>
            </th>
            <td>
              {typeof value === 'number' ? value.toFixed(3) : JSON.stringify(value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CostMeters({
  cost,
}: {
  cost: Record<string, { spent: number; budget: number }>;
}) {
  const rows = Object.entries(cost);
  if (rows.length === 0) return null;
  return (
    <div className="meters">
      {rows.map(([dim, c]) => {
        const pct = c.budget > 0 ? Math.min(1, c.spent / c.budget) * 100 : 0;
        return (
          <div key={dim} className={pct > 90 ? 'meter is-hot' : 'meter'}>
            <span className="meter__label">{dim}</span>
            <span className="meter__track">
              <span className="meter__fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="meter__num">
              {c.spent}/{c.budget || '∞'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
