export function QuarantineReview({ item }: { item: unknown }) {
  return <main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-2xl font-medium">Quarantine review</h1><p className="muted">This review surface is awaiting its quarantine resolver.</p><pre>{JSON.stringify(item, null, 2)}</pre></main>;
}
