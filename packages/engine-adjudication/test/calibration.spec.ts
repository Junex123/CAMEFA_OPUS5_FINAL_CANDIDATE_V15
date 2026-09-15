import { describe, expect, it } from 'vitest';
import { calibrateReviewers, pseudonymOf, type ReviewerOutcome } from '../src/calibration.js';

const rows = (
  reviewerId: string,
  n: number,
  anchor: boolean | null,
  consensus: boolean | null,
): ReviewerOutcome[] =>
  Array.from({ length: n }, (_, i) => ({
    reviewerId,
    conflictId: `c:${reviewerId}:${i}`,
    agreedWithAnchor: anchor,
    agreedWithConsensus: consensus,
  }));

describe('calibrateReviewers', () => {
  it('bands a reviewer on anchored agreement only', () => {
    const [r] = calibrateReviewers([...rows('usr:1', 10, true, false)]);
    expect(r.kappaAnchored).toBeCloseTo(1, 6);
    expect(r.band).toBe('high');
  });

  it('does not reward matching the crowd when anchors disagree', () => {
    const [r] = calibrateReviewers([...rows('usr:1', 10, false, true)]);
    expect(r.band).toBe('low');
    expect(r.kappaConsensus).toBeCloseTo(1, 6);
  });

  it('flags herding when consensus far outruns anchored agreement', () => {
    const [r] = calibrateReviewers([
      ...rows('usr:1', 5, true, true),
      ...rows('usr:1', 5, false, true),
    ]);
    expect(r.herding).toBe(true);
  });

  it('leaves a reviewer unrated below the anchored sample floor', () => {
    const [r] = calibrateReviewers(rows('usr:1', 3, true, true));
    expect(r.band).toBe('unrated');
    expect(r.herding).toBe(false);
  });

  it('reports null kappa when no anchored outcomes exist', () => {
    const [r] = calibrateReviewers(rows('usr:1', 20, null, true));
    expect(r.kappaAnchored).toBeNull();
    expect(r.band).toBe('unrated');
  });

  it('is deterministic and sorted by reviewer', () => {
    const out = calibrateReviewers([...rows('usr:b', 9, true, true), ...rows('usr:a', 9, true, true)]);
    expect(out.map((r) => r.reviewerId)).toEqual(['usr:a', 'usr:b']);
  });
});

describe('pseudonymOf', () => {
  it('is stable per salt and hides the underlying id', () => {
    const p = pseudonymOf('usr:secret', 'salt');
    expect(p).toBe(pseudonymOf('usr:secret', 'salt'));
    expect(p).not.toContain('secret');
  });

  it('differs across salts so pseudonyms cannot be linked across surfaces', () => {
    expect(pseudonymOf('usr:1', 'a')).not.toBe(pseudonymOf('usr:1', 'b'));
  });
});
