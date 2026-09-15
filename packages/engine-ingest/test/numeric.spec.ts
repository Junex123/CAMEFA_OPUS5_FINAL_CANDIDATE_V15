import { describe, expect, it } from 'vitest';
import { NumericParseError, parseFraction, parseNumeric } from '../src/parse/numeric.js';

describe('parseNumeric', () => {
  it('parses value and unit', () => {
    expect(parseNumeric('658 g')).toMatchObject({ value: 658, unit: 'g' });
  });

  it('retains the precision the source stated', () => {
    expect(parseNumeric('658 g').precision).toBe(0);
    expect(parseNumeric('658.00 g').precision).toBe(2);
  });

  it('handles thousands separators', () => {
    expect(parseNumeric('$3,999.99').value).toBeCloseTo(3999.99, 6);
  });

  it('normalises unit aliases', () => {
    expect(parseNumeric('1.2 kg').unit).toBe('kg');
    expect(parseNumeric('5 EV').unit).toBe('stops');
  });

  it('marks approximations so they can be flagged downstream', () => {
    expect(parseNumeric('approx. 700 g').approximate).toBe(true);
    expect(parseNumeric('650–700 g').approximate).toBe(true);
    expect(parseNumeric('700 g').approximate).toBe(false);
  });

  it('applies a default unit when the source omits one', () => {
    expect(parseNumeric('24', 'count')).toMatchObject({ value: 24, unit: 'count' });
  });

  it('refuses rather than guessing when no unit is available', () => {
    expect(() => parseNumeric('24')).toThrow(NumericParseError);
  });

  it('refuses unrecognised units instead of passing them through', () => {
    expect(() => parseNumeric('12 furlongs')).toThrow(/unrecognised unit/);
  });

  it('refuses text with no number', () => {
    expect(() => parseNumeric('not specified', 'g')).toThrow(/no number/);
  });
});

describe('parseFraction', () => {
  it('parses shutter fractions', () => {
    expect(parseFraction('1/200 s').value).toBeCloseTo(0.005, 9);
  });

  it('falls back to plain parsing for decimals', () => {
    expect(parseFraction('0.004 s').value).toBeCloseTo(0.004, 9);
  });

  it('refuses a zero denominator', () => {
    expect(() => parseFraction('1/0')).toThrow(/zero denominator/);
  });
});
