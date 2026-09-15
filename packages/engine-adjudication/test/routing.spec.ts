import { describe, expect, it } from 'vitest';
import { checkSubmission, grantLease, LEASE_TTL_MS, type Lease } from '../src/routing.js';

const now = new Date('2026-02-01T12:00:00.000Z');
const later = new Date(now.getTime() + LEASE_TTL_MS + 1000);

const lease = (over: Partial<Lease> = {}): Lease => ({
  conflictId: 'conf:1',
  reviewerId: 'usr:1',
  compositionHash: 'comp:1',
  grantedAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + LEASE_TTL_MS).toISOString(),
  ...over,
});

describe('grantLease', () => {
  it('grants when nothing is held', () => {
    const out = grantLease('conf:1', 'usr:1', 'comp:1', null, now);
    expect(out.kind).toBe('granted');
  });

  it('refuses while another reviewer holds a live lease', () => {
    const out = grantLease('conf:1', 'usr:2', 'comp:1', lease(), now);
    expect(out).toMatchObject({ kind: 'held_by_other', reviewerId: 'usr:1' });
  });

  it('renews for the same reviewer and preserves the original grant time', () => {
    const out = grantLease('conf:1', 'usr:1', 'comp:1', lease(), new Date(now.getTime() + 60_000));
    expect(out.kind).toBe('renewed');
    if (out.kind === 'renewed') expect(out.lease.grantedAt).toBe(now.toISOString());
  });

  it('returns stranded work to the queue once the lease expires', () => {
    const out = grantLease('conf:1', 'usr:2', 'comp:1', lease(), later);
    expect(out.kind).toBe('granted');
  });
});

describe('checkSubmission', () => {
  it('accepts a valid in-window submission', () => {
    expect(checkSubmission(lease(), 'usr:1', 'comp:1', now)).toEqual({ ok: true });
  });

  it('rejects a submission from a non-holder', () => {
    expect(checkSubmission(lease(), 'usr:2', 'comp:1', now)).toMatchObject({
      code: 'not_lease_holder',
    });
  });

  it('rejects an expired lease', () => {
    expect(checkSubmission(lease(), 'usr:1', 'comp:1', later)).toMatchObject({
      code: 'lease_expired',
    });
  });

  it('warns rather than silently accepting when new evidence arrived', () => {
    const check = checkSubmission(lease(), 'usr:1', 'comp:2', now);
    expect(check).toMatchObject({ ok: false, code: 'evidence_changed' });
  });

  it('treats a missing lease as expired', () => {
    expect(checkSubmission(null, 'usr:1', 'comp:1', now)).toMatchObject({ code: 'lease_expired' });
  });
});
