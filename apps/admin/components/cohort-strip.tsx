/**
 * Peer distribution as a strip, not a number. A reviewer reading "median 2"
 * anchors on it; seeing the spread communicates how unusual a value would be
 * without telling them which option to pick.
 */
export function CohortStrip({
  summary, unit,
}: { summary: { median: number; p10: number; p90: number; n: number }; unit: string | null }) {
  const span = Math.max(summary.p90 - summary.p10, 1e-9);
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - summary.p10) / span) * 100))}%`;

  return (
    <figure className="rounded-lg bg-neutral-50 p-4">
      <figcaption className="text-xs text-neutral-500">
        Comparable products (n={summary.n})
      </figcaption>
      <div className="relative mt-3 h-1.5 rounded-full bg-neutral-200">
        <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-neutral-700" style={{ left: pos(summary.median) }} />
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-neutral-500">
        <span>{summary.p10}{unit ? ` ${unit}` : ''}</span>
        <span>median {summary.median}</span>
        <span>{summary.p90}{unit ? ` ${unit}` : ''}</span>
      </div>
    </figure>
  );
}
