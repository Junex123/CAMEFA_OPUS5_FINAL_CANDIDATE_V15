import { describe, expect, it } from 'vitest';
import { hashBody, MemoryRawStore } from '../src/raw.js';

const capture = (body: string, over: Partial<Parameters<MemoryRawStore['put']>[0]> = {}) => ({
  sourceId: 'src:a',
  url: 'https://example.com/product/x',
  body: new TextEncoder().encode(body),
  etag: 'W/"1"',
  fetchedAt: '2026-01-01T00:00:00.000Z',
  runId: 'r1',
  ...over,
});

describe('MemoryRawStore', () => {
  it('content-addresses bodies so identical captures dedupe', async () => {
    const store = new MemoryRawStore();
    const a = await store.put(capture('<p>x</p>'));
    const b = await store.put(capture('<p>x</p>', { runId: 'r2' }));
    expect(a.contentHash).toBe(b.contentHash);
    expect(hashBody(new TextEncoder().encode('<p>x</p>'))).toBe(a.contentHash);
  });

  it('retains every observation as history rather than overwriting', async () => {
    const store = new MemoryRawStore();
    await store.put(capture('<p>old</p>'));
    await store.put(capture('<p>new</p>', { etag: 'W/"2"' }));
    const history = await store.history('https://example.com/product/x');
    expect(history).toHaveLength(2);
    expect(history[0].text).toBe('<p>new</p>');
  });

  it('reports the newest etag for conditional fetching', async () => {
    const store = new MemoryRawStore();
    await store.put(capture('<p>x</p>', { etag: 'W/"1"' }));
    await store.put(capture('<p>y</p>', { etag: 'W/"2"' }));
    expect(await store.etagFor('https://example.com/product/x')).toBe('W/"2"');
  });

  it('returns null for an unseen url', async () => {
    expect(await new MemoryRawStore().etagFor('https://example.com/nope')).toBeNull();
  });
});
