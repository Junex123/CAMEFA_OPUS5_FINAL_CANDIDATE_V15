import type { Frame } from './stream-reduce.js';

/** Minimal SSE parser over fetch(); avoids EventSource (POST body required). */
export async function* readFrames(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<Frame> {
  if (!res.body) throw new Error('no response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  signal?.addEventListener('abort', () => void reader.cancel(), { once: true });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!data) continue; // comment/heartbeat
      yield JSON.parse(data) as Frame;
    }
  }
}
