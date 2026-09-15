import { describe, expect, it } from 'vitest';
import { epochGuard } from '../src/epoch.js';

const run = { setId: 's' } as never;

describe('epochGuard', () => {
  it('refuses to compare across a corpus swap', () => {
    const g = epochGuard(run, { corpusEpoch: 'ep:real1', baselineEpoch: 'ep:syn0' });
    expect(g.comparable).toBe(false);
    expect(g.reason).toContain('ep:syn0');
  });

  it('demands re-baselining when baselines predate epochs', () => {
    expect(epochGuard(run, { corpusEpoch: 'ep:1', baselineEpoch: null }).comparable).toBe(false);
  });

  it('allows comparison within one epoch', () => {
    expect(epochGuard(run, { corpusEpoch: 'ep:1', baselineEpoch: 'ep:1' })).toEqual({
      comparable: true,
      reason: null,
    });
  });
});
