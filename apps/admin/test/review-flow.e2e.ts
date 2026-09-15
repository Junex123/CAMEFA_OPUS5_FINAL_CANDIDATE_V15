import { describe, it, expect, beforeAll } from 'vitest';
import { buildAdminHarness, type AdminHarness } from './harness.js';

let h: AdminHarness;
beforeAll(async () => { h = await buildAdminHarness(); });

describe('review flow', () => {
  it('presents a conflict with no source identity anywhere in the payload', async () => {
    const res = await h.as('reviewer_a').post('/admin/v1/adjudication/next').expect(201);
    const body = JSON.stringify(res.body);
    for (const s of h.sourceIds) expect(body).not.toContain(s);
    expect(res.body.item.presentation.blinded).toBe(true);
  });

  it('rejects a submission after the lease has expired', async () => {
    const next = await h.as('reviewer_a').post('/admin/v1/adjudication/next');
    h.advanceClock(13 * 60 * 1000);
    const res = await h.as('reviewer_a').post('/admin/v1/adjudication/submit').send({
      itemId: next.body.item.presentation.conflictId,
      leaseToken: next.body.item.lease.leaseToken,
      verdict: { kind: 'select', optionToken: next.body.item.presentation.options[0].optionToken },
      certainty: 4, elapsedMs: 20_000,
    }).expect(400);
    expect(res.body.error.message).toContain('lease expired');
  });

  it('writes the event, agreement log, and lease release atomically', async () => {
    const next = await h.as('reviewer_b').post('/admin/v1/adjudication/next');
    const conflictId = next.body.item.presentation.conflictId;
    h.failNextWriteTo('sourceAdjudication');

    await h.as('reviewer_b').post('/admin/v1/adjudication/submit').send({
      itemId: conflictId, leaseToken: next.body.item.lease.leaseToken,
      verdict: { kind: 'select', optionToken: next.body.item.presentation.options[0].optionToken },
      certainty: 4, elapsedMs: 15_000,
    }).expect(500);

    expect(await h.prisma.adjudicationEvent.count({ where: { conflictId } })).toBe(0);
    expect(await h.prisma.reviewLease.count({ where: { itemId: conflictId } })).toBe(1);
  });

  it('unblinding severs the reliability contribution but still resolves', async () => {
    const next = await h.as('reviewer_c').post('/admin/v1/adjudication/next');
    const { conflictId, options } = next.body.item.presentation;
    await h.as('reviewer_c').post('/admin/v1/adjudication/unblind')
      .send({ itemId: conflictId, leaseToken: next.body.item.lease.leaseToken }).expect(201);

    const res = await h.as('reviewer_c').post('/admin/v1/adjudication/submit').send({
      itemId: conflictId, leaseToken: next.body.item.lease.leaseToken,
      verdict: { kind: 'select', optionToken: options[0].optionToken },
      certainty: 5, elapsedMs: 30_000,
    }).expect(201);

    expect(res.body.accepted).toBe(true);
    expect(res.body.contributedToReliability).toBe(false);
  });

  it('resolution supersedes rather than deletes the losing claims', async () => {
    const conflictId = await h.resolveWithConcurrence();
    const resolution = await h.prisma.claimResolution.findUnique({ where: { conflictId } });
    expect(resolution!.supersededClaimIds.length).toBeGreaterThan(0);
    for (const id of resolution!.supersededClaimIds) {
      expect(await h.prisma.claim.findUnique({ where: { id } })).not.toBeNull();
    }
  });

  it('exposes calibration validity so conformity is never mistaken for accuracy', async () => {
    const res = await h.as('reviewer_a').get('/admin/v1/adjudication/me').expect(200);
    expect(res.body.validity).toHaveProperty('valid');
    if (!res.body.validity.valid) expect(res.body.voteWeight).toBeLessThanOrEqual(0.6);
  });
});
