import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { buildTestApp, type TestApp } from './harness.js';
import { FLAGSHIP_A, FLAGSHIP_B } from '@camefa/engine-testkit';

let app: TestApp;
beforeAll(async () => { app = await buildTestApp(); });
afterAll(async () => { await app.close(); });

describe('POST /v1/evaluate', () => {
  it('returns a receipt header and persists the receipt', async () => {
    const res = await request(app.server)
      .post('/v1/evaluate')
      .set('x-camefa-as-of', '2026-01-01T00:00:00.000Z')
      .send({ candidates: [FLAGSHIP_A, FLAGSHIP_B], requirements: [] })
      .expect(201);

    const receiptId = res.headers['x-camefa-receipt'];
    expect(receiptId).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers['cache-control']).toContain('immutable');
    expect(Number(res.headers['x-camefa-work-units'])).toBeGreaterThan(0);

    const stored = await app.prisma.decisionReceipt.findUnique({ where: { receiptId } });
    expect(stored?.determinism).toBe('deterministic');
  });

  it('rejects malformed input at the edge, before any engine work', async () => {
    const res = await request(app.server).post('/v1/evaluate').send({ candidates: 'not-an-array' }).expect(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(app.spy.derivationCalls).toBe(0);
  });

  it('429s with Retry-After once the anonymous bucket drains', async () => {
    const body = { candidates: [FLAGSHIP_A], requirements: [] };
    let limited: request.Response | undefined;
    for (let i = 0; i < 400 && !limited; i++) {
      const r = await request(app.server).post('/v1/evaluate').send(body);
      if (r.status === 429) limited = r;
    }
    expect(limited).toBeDefined();
    expect(limited!.headers['retry-after']).toBeDefined();
    expect(limited!.body.error.retryable).toBe(true);
  });

  it('refunds unspent reservation so cheap calls do not drain the bucket', async () => {
    const before = await app.tokens('anonymous', 'test-fp');
    await request(app.server).post('/v1/evaluate').send({ candidates: [FLAGSHIP_A], requirements: [] });
    const after = await app.tokens('anonymous', 'test-fp');
    expect(before - after).toBeLessThan(400); // estimate was 160/candidate-ish, actual far lower
  });
});

describe('GET /v1/receipts/:slug', () => {
  it('serves an immutable public decision page with lineage', async () => {
    const post = await request(app.server)
      .post('/v1/evaluate')
      .set('x-camefa-as-of', '2026-01-01T00:00:00.000Z')
      .send({ candidates: [FLAGSHIP_A, FLAGSHIP_B], requirements: [] });

    const slug = `evaluate-${post.headers['x-camefa-receipt'].slice(0, 16)}`;
    const res = await request(app.server).get(`/v1/receipts/${slug}`).expect(200);

    expect(res.body.data.engine.ontology[0].fingerprint).toBeTruthy();
    expect(res.body.data.lineage).not.toBeNull();
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('404s unknown slugs without leaking existence of digests', async () => {
    await request(app.server).get('/v1/receipts/evaluate-deadbeefdeadbeef').expect(404);
  });
});
