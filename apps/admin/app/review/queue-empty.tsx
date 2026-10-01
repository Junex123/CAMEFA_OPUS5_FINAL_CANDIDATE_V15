export function QueueEmpty({ reason }: { reason?: string }) {
  return <main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-2xl font-medium">Review queue empty</h1><p className="muted">{reason ?? 'No review item is available.'}</p></main>;
}
