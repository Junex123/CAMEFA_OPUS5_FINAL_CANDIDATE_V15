import { describe, expect, it } from 'vitest';
import { assessBlindSpots, type AnchorOutcome } from '../src/surprise.js';

const rows = (
  n: number,
  selection: AnchorOutcome['selection'],
  surprising: boolean,
  stratum = 'physical',
  signed = 1,
): AnchorOutcome[] =>
  Array.from({ length: n }, (_, i) => ({
    slotKey: `${stratum}:${selection}:${i}`,
    stratum,
    selection,
    absError: Math.abs(signed),
    signedError: signed,
    jnd: 0.5,
    surprising,
  }));

describe('assessBlindSpots', () => {
  it('refuses to conclude anything from thin data', () => {
    const r = assessBlindSpots([...rows(3, 'targeted', false), ...rows(2, 'exploratory', true)]);
    expect(r.underPowered).toBe(true);
    expect(r.blindSpot).toBe(false);
  });

  it('detects when blind samples find errors targeting misses', () => {
    const r = assessBlindSpots([
      ...rows(20, 'targeted', false),
      ...rows(14, 'exploratory', true),
    ]);
    expect(r.blindSpot).toBe(true);
    expect(r.narrative).toContain('confident');
  });

  it('reports no blind spot when both arms agree', () => {
    const r = assessBlindSpots([
      ...rows(20, 'targeted', false),
      ...rows(20, 'exploratory', false),
    ]);
    expect(r.blindSpot).toBe(false);
  });

  it('flags a systematic offset separately from random error', () => {
    const biased = assessBlindSpots([
      ...rows(20, 'targeted', true, 'optical', 4),
      ...rows(20, 'exploratory', true, 'optical', 4),
    ]);
    expect(biased.byStratum[0].biased).toBe(true);
    expect(biased.narrative).toContain('parser or unit conversion');
  });

  it('does not call alternating-sign error systematic', () => {
    const alternating = Array.from({ length: 24 }, (_, i) => ({
      slotKey: `s${i}`,
      stratum: 'optical',
      selection: (i % 2 === 0 ? 'targeted' : 'exploratory') as const,
      absError: 4,
      signedError: i % 2 === 0 ? 4 : -4,
      jnd: 0.5,
      surprising: true,
    }));
    expect(assessBlindSpots(alternating).byStratum[0].biased).toBe(false);
  });
});
