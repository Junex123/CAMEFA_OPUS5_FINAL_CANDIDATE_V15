import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchDiff, GatewayError } from '@/lib/gateway';
import { AttributionBanner } from '@/components/attribution-banner';
import { DiffTable } from '@/components/diff-table';
import { VersionDiff } from '@/components/version-diff';

export const dynamic = 'force-static';
export const revalidate = false;

export async function generateMetadata({ params }: { params: { receiptId: string; receiptIdB: string } }) {
  return {
    title: `Diff ${params.receiptId.slice(0, 8)} → ${params.receiptIdB.slice(0, 8)} · Camefa`,
    robots: { index: false },
  };
}

export default async function DiffPage({
  params,
}: {
  params: { receiptId: string; receiptIdB: string };
}) {
  let diff;
  try {
    diff = await fetchDiff(params.receiptId, params.receiptIdB);
  } catch (e) {
    if (e instanceof GatewayError && e.status === 404) notFound();
    throw e;
  }

  return (
    <main className="diff">
      <header>
        <p className="eyebrow">Decision diff</p>
        <h1>What changed, and what changed it</h1>
        <p className="addr">
          <Link href={`/r/${diff.a}`}>{diff.a.slice(0, 16)}…</Link> →{' '}
          <Link href={`/r/${diff.b}`}>{diff.b.slice(0, 16)}…</Link>
        </p>
        <AttributionBanner diff={diff} />
      </header>

      <section aria-labelledby="movement">
        <h2 id="movement">Ranking movement</h2>
        <p className="muted">
          Kendall τ distance {diff.tau.normalized.toFixed(3)} (
          {diff.tau.discordant}/{diff.tau.pairs} pairs swapped) · largest score
          delta {diff.maxScoreDelta.toFixed(3)}
        </p>
        <DiffTable rows={diff.rows} />
      </section>

      <section aria-labelledby="versions">
        <h2 id="versions">Version deltas</h2>
        <VersionDiff versions={diff.versions} changed={diff.changed} />
      </section>
    </main>
  );
}
