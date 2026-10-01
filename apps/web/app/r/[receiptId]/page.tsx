import { notFound } from 'next/navigation';
import { fetchReceipt, GatewayError } from '@/lib/gateway';
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
  let receipt;
  try {
    receipt = await fetchReceipt(params.receiptId);
  } catch (error) {
    if (error instanceof GatewayError && error.status === 404) notFound();
    throw error;
  }

  const verification = verifyReceipt(receipt);

  return (
    <main className="receipt">
      <header className="receipt__head">
        <p className="eyebrow">Decision receipt</p>
        <h1>Profile: {receipt.request.profile}</h1>
        <code className="addr" title="content address">{receipt.receiptId}</code>
        <ReplayBadge verification={verification} />
      </header>

      <section aria-labelledby="decision">
        <h2 id="decision">Decision</h2>
        <p className="muted">Outcome: {receipt.decision.outcome}</p>
        <VerdictTable decision={receipt.decision} />
      </section>

      <section aria-labelledby="why">
        <h2 id="why">Why</h2>
        <LineageTree node={receipt.lineage} />
      </section>

      <section aria-labelledby="provenance">
        <h2 id="provenance">Provenance &amp; version</h2>
        <EngineTripletCard engine={receipt.versions} />
        <CostPanel cost={receipt.cost} />
      </section>

      <footer className="muted">
        Sealed {new Date(receipt.sealedAt).toISOString()}
      </footer>
    </main>
  );
}
