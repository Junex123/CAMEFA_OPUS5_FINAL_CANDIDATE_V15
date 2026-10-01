export function CohortStrip({ summary }: { summary: unknown; unit?: string }) {
  return <div className="alert">{String(summary)}</div>;
}
