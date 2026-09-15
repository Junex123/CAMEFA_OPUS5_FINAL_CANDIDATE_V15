import { contentHash } from '@camefa/engine-kernel';
import type { QueueItem } from './queue.js';
import type { ReviewerCalibration } from './agreement.js';
import { shouldDoubleRoute } from './agreement.js';

/**
 * ADR-067: an item under review is leased, not locked. A lease expires on its
 * own, so a reviewer who closes their laptop mid-item cannot strand work, and
 * no cleanup job is required for correctness.
 */
export type Lease = {
  readonly itemId: string;
  readonly reviewerId: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  /** Which pass this is: 1 = primary, 2 = calibration overlap. */
  readonly pass: 1 | 2;
  readonly leaseToken: string;
};

export const LEASE_MS = 12 * 60 * 1000;

export type RoutingState = {
  /** itemId → active leases. Length 2 only for double-routed items. */
  readonly leases: ReadonlyMap<string, readonly Lease[]>;
  /** itemId → reviewerIds who already submitted. */
  readonly completed: ReadonlyMap<string, readonly string[]>;
};

export type RoutingRefusal =
  | { readonly code: 'ALREADY_REVIEWED' }
  | { readonly code: 'PASS_FULL' }
  | { readonly code: 'REVIEWER_FLAGGED' }
  | { readonly code: 'CONFLICT_OF_INTEREST' };

const active = (leases: readonly Lease[], nowMs: number) =>
  leases.filter((l) => Date.parse(l.expiresAt) > nowMs);

/**
 * The second pass exists to measure agreement, so it must be uncontaminated:
 * the second reviewer sees the same blind presentation and never learns that a
 * first verdict exists. Contamination here silently inflates every kappa.
 */
export const nextAssignment = (args: {
  reviewerId: string;
  calibration: ReviewerCalibration;
  queue: readonly QueueItem[];
  state: RoutingState;
  reviewerSourceIds: readonly string[];
  itemSourceIds: ReadonlyMap<string, readonly string[]>;
  now: string;
}): { item: QueueItem; lease: Lease } | { refused: RoutingRefusal } => {
  if (args.calibration.status === 'flagged') return { refused: { code: 'REVIEWER_FLAGGED' } };

  const nowMs = Date.parse(args.now);
  const mine = new Set(args.reviewerSourceIds);

  for (const item of args.queue) {
    const done = args.state.completed.get(item.itemId) ?? [];
    if (done.includes(args.reviewerId)) continue;

    const held = active(args.state.leases.get(item.itemId) ?? [], nowMs);
    if (held.some((l) => l.reviewerId === args.reviewerId)) continue;

    const capacity = shouldDoubleRoute(item.itemId) ? 2 : 1;
    if (done.length + held.length >= capacity) continue;

    const sources = args.itemSourceIds.get(item.itemId) ?? [];
    if (sources.some((s) => mine.has(s))) continue;

    // Trainees are routed to items that are already anchored or double-routed,
    // so their verdicts generate calibration signal before they carry weight.
    if (args.calibration.status === 'trainee' && capacity === 1 && item.blocksHardGate) continue;

    const pass: 1 | 2 = done.length + held.length === 0 ? 1 : 2;
    const grantedAt = args.now;
    const expiresAt = new Date(nowMs + LEASE_MS).toISOString();

    return {
      item,
      lease: {
        itemId: item.itemId,
        reviewerId: args.reviewerId,
        grantedAt,
        expiresAt,
        pass,
        leaseToken: contentHash({ i: item.itemId, r: args.reviewerId, g: grantedAt }),
      },
    };
  }

  return { refused: { code: 'PASS_FULL' } };
};

export const leaseValid = (lease: Lease | null, token: string, now: string): boolean =>
  lease !== null && lease.leaseToken === token && Date.parse(lease.expiresAt) > Date.parse(now);
