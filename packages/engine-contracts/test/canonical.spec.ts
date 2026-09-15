import { describe, expect, it } from 'vitest';
import {
  canonicalHash,
  canonicalise,
  CanonicalisationError,
  isContentAddress,
} from '../src/canonical.js';

describe('canonicalise', () => {
  it('is insensitive to key insertion order', () => {
    expect(canonicalise({ b: 1, a: 2 })).toBe(canonicalise({ a: 2, b: 1 }));
  });

  it('is sensitive to array order', () => {
    expect(canonicalise([1, 2])).not.toBe(canonicalise([2, 1]));
  });

  it('omits undefined properties instead of emitting null', () => {
    expect(canonicalise({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('rejects a bare undefined', () => {
    expect(() => canonicalise(undefined)).toThrow(CanonicalisationError);
  });

  it('rejects non-finite numbers rather than coercing them', () => {
    expect(() => canonicalise({ x: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalise({ x: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });

  it('normalises negative zero', () => {
    expect(canonicalise({ x: -0 })).toBe('{"x":0}');
  });

  it('refuses non-plain objects so a Date cannot silently become a string', () => {
    expect(() => canonicalise({ at: new Date(0) })).toThrow(/non-plain/);
    expect(() => canonicalise({ s: new Set([1]) })).toThrow(/non-plain/);
  });

  it('rejects bigint, functions and symbols', () => {
    expect(() => canonicalise({ n: 1n })).toThrow(/bigint/);
    expect(() => canonicalise({ f: () => 1 })).toThrow(/function/);
    expect(() => canonicalise({ s: Symbol('x') })).toThrow(/symbol/);
  });

  it('names the offending path', () => {
    expect(() => canonicalise({ a: { b: [1, Number.NaN] } })).toThrow(/\$\.a\.b\[1\]/);
  });

  it('escapes strings via JSON rules', () => {
    expect(canonicalise('a"b\n')).toBe('"a\\"b\\n"');
  });
});

describe('canonicalHash', () => {
  it('produces a recognisable, stable address', () => {
    const h = canonicalHash({ a: 1 });
    expect(isContentAddress(h)).toBe(true);
    expect(h).toBe(canonicalHash({ a: 1 }));
  });

  it('changes when any field changes', () => {
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }));
  });

  it('does not collide across nesting shapes', () => {
    expect(canonicalHash({ a: { b: 1 } })).not.toBe(canonicalHash({ 'a.b': 1 }));
  });
});
