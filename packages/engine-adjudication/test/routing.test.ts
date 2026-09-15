import { describe, it, expect } from 'vitest';
import { nextAssignment, leaseValid, LEASE_MS } from '../src/routing.js';
import { shouldDoubleRoute } from '../src/agreement.js';
import { mkQueueItem, mkCalibration } from '@camefa/engine-testkit';

const now = '2026-03-01T00:00:00.000Z';
const empty = { leases: new Map(), completed: new Map() };
const base = {
  reviewerId: 'r1',
  calibration: mkCalibration({ status: 'active', voteWeight: 0.9 }),
  reviewerSourceIds: [],
  itemSourceIds: new Map(),
  now,
};

const singleRouted = () => {
  const item = [...Array(200).keys()].map((i) => mkQueueItem({ itemId: `item-${i}` })).find((i) => !shouldDoubleRoute(i.itemId))!;
  return item;
};

describe('assignment', () => {
  it('never hands a reviewer an item they already submitted', () => {
    const item = mkQueueItem({ itemId: 'x1' });
    const r = nextAssignment({ ...base, queue: [item], state: { leases: new Map(), completed: new Map([['x1', ['r1']]]) } });
    expect('refused' in r).toBe(true);
  });

  it('respects a live lease held by someone else on a single-routed item', () => {
    const item = singleRouted();
    const leases = new Map([[item.itemId, [{ itemId: item.itemId, reviewerId: 'r2', grantedAt: now, expiresAt: '2026-03-01T00:10:00.000Z', pass: 1 as const, leaseToken: 't' }]]]);
    expect('refused' in nextAssignment({ ...base, queue: [item], state: { leases, completed: new Map() } })).toBe(true);
  });

  it('reissues an item whose lease expired, with no cleanup job', () => {
    const item = singleRouted();
    const leases = new Map([[item.itemId, [{ itemId: item.itemId, reviewerId: 'r2', grantedAt: '2026-02-28T00:00:00.000Z', expiresAt: '2026-02-28T00:12:00.000Z', pass: 1 as const, leaseToken: 't' }]]]);
    const r = nextAssignment({ ...base, queue: [item], state: { leases, completed: new Map() } });
    expect('item' in r).toBe(true);
  });

  it('grants a second pass on double-routed items and marks it pass 2', () => {
    const item = [...Array(200).keys()].map((i) => mkQueueItem({ itemId: `d-${i}` })).find((i) => shouldDoubleRoute(i.itemId))!;
    const r = nextAssignment({ ...base, queue: [item], state: { leases: new Map(), completed: new Map([[item.itemId, ['r2']]]) } });
    expect('item' in r && r.lease.pass).toBe(2);
  });

  it('refuses a flagged reviewer outright', () => {
    const r = nextAssignment({ ...base, calibration: mkCalibration({ status: 'flagged', voteWeight: 0 }), queue: [mkQueueItem({})], state: empty });
    expect('refused' in r && r.refused.code).toBe('REVIEWER_FLAGGED');
  });

  it('keeps a reviewer away from items touching their own sources', () => {
    const item = mkQueueItem({ itemId: 'coi' });
    const r = nextAssignment({
      ...base, reviewerSourceIds: ['vendor.acme'],
      itemSourceIds: new Map([['coi', ['vendor.acme', 'other']]]),
      queue: [item], state: empty,
    });
    expect('refused' in r).toBe(true);
  });

  it('does not route trainees to hard-gated single-pass items', () => {
    const item = { ...singleRouted(), blocksHardGate: true };
    const r = nextAssignment({ ...base, calibration: mkCalibration({ status: 'trainee', voteWeight: 0.4 }), queue: [item], state: empty });
    expect('refused' in r).toBe(true);
  });

  it('issues a lease that expires on schedule', () => {
    const r = nextAssignment({ ...base, queue: [mkQueueItem({ itemId: 'z' })], state: empty });
    if (!('item' in r)) throw new Error('expected assignment');
    expect(Date.parse(r.lease.expiresAt) - Date.parse(now)).toBe(LEASE_MS);
    expect(leaseValid(r.lease, r.lease.leaseToken, now)).toBe(true);
    expect(leaseValid(r.lease, r.lease.leaseToken, '2026-03-01T00:13:00.000Z')).toBe(false);
    expect(leaseValid(r.lease, 'forged', now)).toBe(false);
  });
});
