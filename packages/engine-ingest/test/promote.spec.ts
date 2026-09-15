import { describe, expect, it } from 'vitest';
import { claimId, MemoryClaimWriter, type PromotableClaim } from '../src/promote.js';
import { toRef } from '../src/raw.js';

const rawRef = (body: string) =>
  toRef({
    sourceId: 'src:a',
    url: 'https://example.com/product/x',
    body: new TextEncoder().encode(body),
    etag: null,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    runId: 'r1',
  });

const claim = (over: Partial<PromotableClaim> = {}): PromotableClaim => ({
  attribute: 'weight_g',
  value: 670,
  unit: 'g',
  rawText: '670 g',
  outlierFlags: [],
  entityId: 'e:1',
  sourceId: 'src:a',
  rawRef: rawRef('<p>670 g</p>'),
  runId: 'r1',
  observedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('claimId', () => {
  it('is stable for identical content, making re-ingestion idempotent', () => {
    expect(claimId(claim())).toBe(claimId(claim({ runId: 'r2' })));
  });

  it('changes when the value changes', () => {
    expect(claimId(claim())).not.toBe(claimId(claim({ value: 680 })));
  });

  it('changes when the source changes', () => {
    expect(claimId(claim())).not.toBe(claimId(claim({ sourceId: 'src:b' })));
  });

  it('changes when the underlying capture changes', () => {
    expect(claimId(claim())).not.toBe(claimId(claim({ rawRef: rawRef('<p>670 g!</p>') })));
  });
});

describe('MemoryClaimWriter', () => {
  it('does not duplicate an identical re-promoted claim', async () => {
    const w = new MemoryClaimWriter();
    await w.promote(claim());
    await w.promote(claim({ runId: 'later' }));
    expect(w.claims.size).toBe(1);
  });

  it('records quarantined resolutions with their capture', async () => {
    const w = new MemoryClaimWriter();
    const ref = rawRef('<p>?</p>');
    await w.quarantine({ kind: 'unknown_entity', reason: 'no match', observedName: 'X' }, ref);
    expect(w.quarantined[0].contentHash).toBe(ref.contentHash);
  });
});
