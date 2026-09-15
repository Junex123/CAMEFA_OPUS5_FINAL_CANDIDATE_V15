import { describe, expect, it } from 'vitest';
import {
  initialStreamState,
  reduceStream,
  type Frame,
} from '../src/lib/stream-reducer.js';

const run = (frames: Frame[]) => frames.reduce(reduceStream, initialStreamState);

describe('reduceStream', () => {
  it('accumulates stages in arrival order', () => {
    const s = run([
      { t: 'stage', name: 'resolve', at: 3 },
      { t: 'stage', name: 'derive', at: 11 },
    ]);
    expect(s.stages.map((x) => x.name)).toEqual(['resolve', 'derive']);
  });

  it('overwrites partials by path', () => {
    const s = run([
      { t: 'partial', path: 'ranked.0.score', value: 0.4 },
      { t: 'partial', path: 'ranked.0.score', value: 0.71 },
    ]);
    expect(s.partials['ranked.0.score']).toBe(0.71);
  });

  it('tracks cumulative cost against budget', () => {
    const s = run([
      { t: 'cost', dim: 'solverNodes', spent: 120, budget: 5000 },
      { t: 'cost', dim: 'solverNodes', spent: 480, budget: 5000 },
    ]);
    expect(s.cost.solverNodes).toEqual({ spent: 480, budget: 5000 });
  });

  it('treats error as terminal even if done arrives after', () => {
    const s = run([
      { t: 'error', code: 'budget_exhausted', message: 'nodes' },
      { t: 'done', ms: 900 },
    ]);
    expect(s.status).toBe('error');
    expect(s.elapsedMs).toBe(900);
  });

  it('records replayability from the receipt frame', () => {
    const s = run([
      { t: 'receipt', receiptId: 'b3:abc', replayable: false },
      { t: 'done', ms: 12 },
    ]);
    expect(s).toMatchObject({ receiptId: 'b3:abc', replayable: false, status: 'done' });
  });
});
