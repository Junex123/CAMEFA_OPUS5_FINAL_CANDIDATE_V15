import { describe, expect, it } from 'vitest';
import { readFrames } from '../src/lib/sse.js';

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch));
        c.close();
      },
    }),
  );
}

describe('readFrames', () => {
  it('parses frames split across chunk boundaries', async () => {
    const res = sseResponse([
      'event: stage\ndata: {"t":"sta',
      'ge","name":"derive","at":4}\n\n: ping\n\n',
      'event: done\ndata: {"t":"done","ms":9}\n\n',
    ]);
    const out = [];
    for await (const f of readFrames(res)) out.push(f);
    expect(out).toEqual([
      { t: 'stage', name: 'derive', at: 4 },
      { t: 'done', ms: 9 },
    ]);
  });

  it('ignores heartbeat comments', async () => {
    const res = sseResponse([': ping\n\n: ping\n\n']);
    const out = [];
    for await (const f of readFrames(res)) out.push(f);
    expect(out).toHaveLength(0);
  });
});
