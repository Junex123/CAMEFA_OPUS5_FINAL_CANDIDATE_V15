export interface ParsedNumber {
  value: number;
  unit: string;
  /** Digits after the decimal point in the source text. */
  precision: number;
  /** Source stated a range or an approximation. */
  approximate: boolean;
}

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  mm: 'mm',
  cm: 'cm',
  s: 's',
  sec: 's',
  ms: 'ms',
  usd: 'usd',
  $: 'usd',
  fps: 'fps',
  stops: 'stops',
  stop: 'stops',
  ev: 'stops',
};

const NUMBER = String.raw`-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?`;

export class NumericParseError extends Error {}

/**
 * Parses a numeric field with its unit, retaining the *precision the source
 * stated*. A source writing "658 g" is asserting something different from one
 * writing "658.0 g", and collapsing both to 658 loses the information needed
 * to tell a genuine disagreement from a rounding artefact (ADR-077).
 */
export function parseNumeric(text: string, defaultUnit?: string): ParsedNumber {
  const cleaned = text.trim().toLowerCase().replace(/\u00a0/g, ' ');
  const approximate = /(approx|about|circa|~|±|\bto\b|–|—)/.test(cleaned);

  const match = new RegExp(`(${NUMBER})\\s*([a-z$]*)`).exec(cleaned);
  if (!match) throw new NumericParseError(`no number in "${text}"`);

  const digits = match[1]!.replace(/,/g, '');
  const value = Number(digits);
  if (!Number.isFinite(value)) throw new NumericParseError(`unparseable number "${match[1]!}"`);

  const rawUnit = match[2]! || defaultUnit || '';
  const unit = UNIT_ALIASES[rawUnit] ?? rawUnit;
  if (!unit) throw new NumericParseError(`no unit in "${text}" and no default given`);
  if (!(unit in UNIT_ALIASES) && !Object.values(UNIT_ALIASES).includes(unit)) {
    throw new NumericParseError(`unrecognised unit "${rawUnit}" in "${text}"`);
  }

  const dot = digits.indexOf('.');
  return {
    value,
    unit,
    precision: dot === -1 ? 0 : digits.length - dot - 1,
    approximate,
  };
}

/** "1/200 s" and "1/200" both mean a shutter fraction. */
export function parseFraction(text: string): ParsedNumber {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(text.trim());
  if (!m) return parseNumeric(text, 's');
  const denominator = Number(m[2]);
  if (denominator === 0) throw new NumericParseError(`zero denominator in "${text}"`);
  return {
    value: Number(m[1]) / denominator,
    unit: 's',
    precision: 6,
    approximate: false,
  };
}
