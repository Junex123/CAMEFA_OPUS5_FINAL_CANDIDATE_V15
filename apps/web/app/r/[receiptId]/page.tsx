import { notFound } from 'next/navigation';
import { fetchLineage, fetchReceipt, GatewayError } from '@/lib/gateway';
import { verifyReceipt } from '@/lib/verify';
import { ReplayBadge } from '@/components/replay-badge';
import { VerdictTable } from '@/components/verdict-table';
import { LineageTree } from '@/components/lineage-tree';
import { CostPanel } from '@/components/cost-panel';
import { EngineTripletCard } from '@/components/engine-triplet-card';

export const dynamic = 'force-static';
export const revalidate = false;

export async function generateMetadata({ params }: { params: { receiptId: string } }) {
  return {
    title: `Decision ${params.receiptId.slice(0, 12)} · Camefa`,
    robots: { index: false },
  };
}

export default async function ReceiptPage({
  params,
}: {
  params: { receiptId: string };
}) {
  let receipt, lineage;
  try {
    [receipt, lineage] = await Promise.all([
      fetchReceipt(params.receiptId),
      fetchLineage(params.receiptId),
    ]);
  } catch (e) {
    if (e instanceof GatewayError && e.status === 404) notFound();
    throw e;
  }

  const verification = verifyReceipt(receipt);

  return (
    <main className="receipt">
      <header className="receipt__head">
        <p className="eyebrow">Decision receipt</p>
        <h1>{receipt.question.label}</h1>
        <code className="addr" title="content address">
          {receipt.receiptId}
        </code>
        <ReplayBadge verification={verification} declared={receipt.replayable} />
      </header>

      <section aria-labelledby="verdict">
        <h2 id="verdict">Verdict</h2>
        <VerdictTable outcome={receipt.outcome} />
      </section>

      <section aria-labelledby="why">
        <h2 id="why">Why</h2>
        <p className="muted">
          Aggregation is non-compensatory (p = {receipt.outcome.aggregationP}); a
          single unmet hard requirement cannot be bought off by surplus elsewhere.
        </p>
        <LineageTree node={lineage} depth={0} />
      </section>

      <section aria-labelledby="provenance">
        <h2 id="provenance">Provenance &amp; version</h2>
        <EngineTripletCard engine={receipt.engine} />
        <CostPanel cost={receipt.cost} />
      </section>

      <footer className="muted">
        Sealed {new Date(receipt.sealedAt).toISOString()} · immutable ·
        recomputed address {verification.computed.slice(0, 16)}…
      </footer>
    </main>
  );
}
