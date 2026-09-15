import { describe, expect, it } from 'vitest';
import { buildGoldenSet, GoldenSetError } from '../src/golden.js';

const q = (key: string) => ({
  questionKey: key,
  label: key,
  request: {},
  stratum: 'wedding',
  baselineReceiptId: 'r:1',
  expectations: [],
});

describe('buildGoldenSet', () => {
  it('fingerprints independently of input ordering', () => {
    const a = buildGoldenSet('s', [q('q:1'), q('q:2')]);
    const b = buildGoldenSet('s', [q('q:2'), q('q:1')]);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('rejects duplicate question keys', () => {
    expect(() => buildGoldenSet('s', [q('q:1'), q('q:1')])).toThrow(GoldenSetError);
  });

  it('rejects anchor expectations without an anchorId', () => {
    const bad = {
      ...q('q:1'),
      expectations: [
        {
          id: 'e',
          provenance: 'anchor' as const,
          rationale: 'because',
          assert: { kind: 'not_eliminated' as const, entityId: 'a' },
        },
      ],
    };
    expect(() => buildGoldenSet('s', [bad])).toThrow(/anchorId/);
  });

  it('counts strata for coverage reporting', () => {
    const set = buildGoldenSet('s', [
      q('q:1'),
      { ...q('q:2'), stratum: 'wildlife' },
    ]);
    expect(set.strata).toEqual({ wedding: 1, wildlife: 1 });
  });
});
