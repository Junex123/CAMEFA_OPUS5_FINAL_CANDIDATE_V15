import { describe, expect, it } from 'vitest';
import { assessReplayability, sameVersion, type EngineVersionTriplet } from '../src/version.js';

const full: EngineVersionTriplet = {
  ontologyFingerprint: 'h1:ont',
  modelRef: 'mdl:1',
  calibrationRef: 'cal:1',
  reliabilityFingerprint: 'rel:1',
  corpusEpoch: 'ep:1',
  engineVersion: '0.0.0',
};

describe('assessReplayability', () => {
  it('passes a complete triplet', () => {
    expect(assessReplayability(full)).toEqual({ replayable: true, missing: [] });
  });

  it('treats empty string as missing, not present', () => {
    expect(assessReplayability({ ...full, modelRef: '' }).missing).toEqual(['modelRef']);
  });

  it('lists dimensions in declared order', () => {
    const v = assessReplayability({
      ...full,
      corpusEpoch: null,
      ontologyFingerprint: '',
    });
    expect(v.missing).toEqual(['ontologyFingerprint', 'corpusEpoch']);
  });
});

describe('sameVersion', () => {
  it('ignores field order', () => {
    const reordered = JSON.parse(
      JSON.stringify({ engineVersion: '0.0.0', ...full }),
    ) as EngineVersionTriplet;
    expect(sameVersion(full, reordered)).toBe(true);
  });

  it('detects a calibration change', () => {
    expect(sameVersion(full, { ...full, calibrationRef: 'cal:2' })).toBe(false);
  });
});
