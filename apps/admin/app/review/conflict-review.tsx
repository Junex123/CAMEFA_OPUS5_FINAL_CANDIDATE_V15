'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitVerdict, unblindItem } from '@/lib/actions';
import { CohortStrip } from '@/components/cohort-strip';
import { CertaintyDial } from '@/components/certainty-dial';
import type { ConflictItem } from '@/lib/types';

export function ConflictReview({ item }: { item: ConflictItem }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [certainty, setCertainty] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [unblinded, setUnblinded] = useState(false);
  const shownAt = useRef(Date.now());

  // Elapsed time is measured from first paint, not from the request, so a slow
  // network cannot make a careful reviewer look like a rubber stamp.
  useEffect(() => { shownAt.current = Date.now(); }, [item.lease.leaseToken]);

  const send = (verdict: Parameters<typeof submitVerdict>[0]['verdict']) =>
    start(async () => {
      await submitVerdict({
        itemId: item.presentation.conflictId,
        leaseToken: item.lease.leaseToken,
        verdict,
        certainty,
        elapsedMs: Date.now() - shownAt.current,
      });
      router.refresh();
    });

  // Keyboard-first: a reviewer clearing 200 items a day must never touch a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending || e.metaKey || e.ctrlKey) return;
      const letter = e.key.toUpperCase();
      const option = item.presentation.options.find((o) => o.label === letter);
      if (option) { setSelected(option.optionToken); return; }
      if (e.key >= '1' && e.key <= '5') { setCertainty(Number(e.key) as 1 | 2 | 3 | 4 | 5); return; }
      if (e.key === 'Enter' && selected) send({ kind: 'select', optionToken: selected });
      if (e.key === 'n') send({ kind: 'reject_all', note: 'none of these values is correct' });
      if (e.key === 't') send({ kind: 'both_valid_over_time', boundary: '' });
      if (e.key === 'e') send({ kind: 'escalate', note: '' });
      if (e.key === 's') send({ kind: 'abstain', note: 'skipped' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, selected, certainty, pending]);

  const p = item.presentation;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-neutral-500">{p.entityLabel}</p>
        <h1 className="text-2xl font-medium">{p.attributeLabel}</h1>
        <p className="mt-2 text-sm text-neutral-600">{p.attributeDescription}</p>
      </header>

      {p.cohortSummary && <CohortStrip summary={p.cohortSummary} unit={p.unit} />}

      <ul className="mt-8 space-y-3">
        {p.options.map((o) => (
          <li key={o.optionToken}>
            <button
              onClick={() => setSelected(o.optionToken)}
              aria-pressed={selected === o.optionToken}
              className={`w-full rounded-lg border p-4 text-left transition ${
                selected === o.optionToken ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-neutral-400">{o.label}</span>
                <span className="text-xs text-neutral-500">
                  {o.supportCount} {o.supportCount === 1 ? 'source' : 'sources'}
                </span>
              </div>
              <div className="mt-1 text-lg tabular-nums">
                {formatValue(o.value)} {p.unit}
              </div>
              {o.excerpt && (
                <blockquote className="mt-2 border-l-2 border-neutral-200 pl-3 text-sm text-neutral-600">
                  {o.excerpt}
                </blockquote>
              )}
            </button>
          </li>
        ))}
      </ul>

      <CertaintyDial value={certainty} onChange={setCertainty} />

      <div className="mt-6 flex flex-wrap gap-2">
        <button disabled={!selected || pending} onClick={() => send({ kind: 'select', optionToken: selected! })}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40">
          Confirm <kbd className="ml-2 opacity-60">↵</kbd>
        </button>
        <button disabled={pending} onClick={() => send({ kind: 'reject_all', note: 'none correct' })}
          className="rounded-md border px-4 py-2 text-sm">None correct <kbd className="ml-2 opacity-50">N</kbd></button>
        <button disabled={pending} onClick={() => send({ kind: 'both_valid_over_time', boundary: '' })}
          className="rounded-md border px-4 py-2 text-sm">Both, over time <kbd className="ml-2 opacity-50">T</kbd></button>
        <button disabled={pending} onClick={() => send({ kind: 'escalate', note: '' })}
          className="rounded-md border px-4 py-2 text-sm">Escalate <kbd className="ml-2 opacity-50">E</kbd></button>
      </div>

      {!unblinded ? (
        <button
          onClick={() => start(async () => {
            await unblindItem({ itemId: p.conflictId, leaseToken: item.lease.leaseToken });
            setUnblinded(true);
            router.refresh();
          })}
          className="mt-8 text-xs text-neutral-400 underline"
        >
          Reveal sources — this verdict will no longer inform source reliability
        </button>
      ) : (
        <p className="mt-8 text-xs text-amber-700">
          Sources revealed. This verdict still resolves the conflict but is excluded
          from reliability scoring.
        </p>
      )}
    </main>
  );
}

const formatValue = (v: unknown): string => {
  if (typeof v === 'object' && v !== null && 'value' in v) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format((v as { value: number }).value);
  }
  return String(v);
};
