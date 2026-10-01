import { redirect } from 'next/navigation';
import { fetchNextItem } from '@/lib/api';
import { ConflictReview } from './conflict-review.js';
import { QuarantineReview } from './quarantine-review.js';
import { QueueEmpty } from './queue-empty.js';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const next = await fetchNextItem();

  if (next.reason === 'REVIEWER_FLAGGED') redirect('/review/blocked');
  if (!next.item) return <QueueEmpty reason={next.reason} />;

  return next.item.kind === 'conflict'
    ? <ConflictReview item={next.item} />
    : <QuarantineReview item={next.item} />;
}
