import { describe, expect, it } from 'vitest';
import { computeReliability, reliabilityOf, type SourceEvidence } from '../src/reliability.js';

const src = (sourceId: string, over: Partial<SourceEvidence> = {}): SourceEvidence => ({
  sourceId,
  prior: 0.8,
  upheld: 0,
  overturned: 0,
  anchoredUpheld: 0,
  anchoredOverturned: 0,
  ...over,
});

describe('computeReliability', () => {
  it('returns the prior when there is no adjudication history', () => {
    const t = computeReliability([src('src:a')]);
    expect(reliabilityOf(t, 'src:a')).toBeCloseTo(0.8, 6);
  });

  it('moves toward observed performance as evidence accumulates', () => {
    const t = computeReliability([src('src:a', { upheld: 2, overturned: 40 })]);
    expect(reliabilityOf(t, 'src:a')).toBeLessThan(0.4);
  });

  it('weights anchored outcomes above consensus ones', () => {
    const consensusOnly = computeReliability([src('src:a', { upheld: 20, overturned: 0 })]);
    const anchorContradicts = computeReliability([
      src('src:a', { upheld: 20, overturned: 0, anchoredUpheld: 0, anchoredOverturned: 6 }),
    ]);
    expect(reliabilityOf(anchorContradicts, 'src:a')).toBeLessThan(
      reliabilityOf(consensusOnly, 'src:a'),
    );
  });

  it('clamps into a usable range so nothing is certain or worthless', () => {
    const perfect = computeReliability([src('src:a', { upheld: 500, overturned: 0 })]);
    const hopeless = computeReliability([src('src:b', { prior: 0.5, upheld: 0, overturned: 500 })]);
    expect(reliabilityOf(perfect, 'src:a')).toBeLessThanOrEqual(0.99);
    expect(reliabilityOf(hopeless, 'src:b')).toBeGreaterThanOrEqual(0.05);
  });

  it('fingerprints the table so receipts can pin it', () => {
    const a = computeReliability([src('src:a'), src('src:b')]);
    const b = computeReliability([src('src:b'), src('src:a')]);
    expect(a.fingerprint).toBe(b.fingerprint);
    const changed = computeReliability([src('src:a', { overturned: 5 }), src('src:b')]);
    expect(changed.fingerprint).not.toBe(a.fingerprint);
  });

  it('falls back to the floor for an unknown source', () => {
    expect(reliabilityOf(computeReliability([]), 'src:ghost')).toBeCloseTo(0.05, 6);
  });

  it('exposes anchored and consensus components separately', () => {
    const t = computeReliability([
      src('src:a', { upheld: 10, overturned: 2, anchoredUpheld: 3, anchoredOverturned: 1 }),
    ]);
    const d = t.detail.get('src:a')!;
    expect(d.anchored).toBeCloseTo(0.75, 6);
    expect(d.consensus).toBeGreaterThan(0.7);
  });
});
