import { describe, expect, it } from 'vitest';
import { prioritise, type QueueSignals } from '../src/queue.js';

const sig = (conflictId: string, over: Partial<QueueSignals> = {}): QueueSignals => ({
  conflictId,
  decisiveDecisions: 0,
  affectedDecisions: 0,
  spreadRatio: 1,
  hasAnchor: false,
  ageHours: 0,
  outlierFlagged: false,
  ...over,
});

describe('prioritise', () => {
  it('ranks a decisive conflict above a merely broad one', () => {
    const out = prioritise([
      sig('c:broad', { affectedDecisions: 5000 }),
      sig('c:decisive', { decisiveDecisions: 3, affectedDecisions: 12 }),
    ]);
    expect(out[0].conflictId).toBe('c:decisive');
    expect(out[0].reason).toContain('decisive');
  });

  it('promotes anchored conflicts for their calibration value', () => {
    const out = prioritise([sig('c:plain'), sig('c:anchored', { hasAnchor: true })]);
    expect(out[0].conflictId).toBe('c:anchored');
  });

  it('surfaces outlier-flagged conflicts as likely parser bugs', () => {
    const out = prioritise([sig('c:plain'), sig('c:flagged', { outlierFlagged: true })]);
    expect(out[0].reason).toContain('parser bug');
  });

  it('saturates in breadth rather than scaling linearly', () => {
    const [small, large] = prioritise([
      sig('c:a', { affectedDecisions: 10 }),
      sig('c:b', { affectedDecisions: 100000 }),
    ]).sort((x, y) => x.conflictId.localeCompare(y.conflictId));
    expect(large.priority / small.priority).toBeLessThan(3);
  });

  it('breaks ties deterministically', () => {
    const out = prioritise([sig('c:z'), sig('c:a')]);
    expect(out.map((e) => e.conflictId)).toEqual(['c:a', 'c:z']);
  });
});
