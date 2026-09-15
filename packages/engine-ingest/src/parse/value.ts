import type { ClaimDraft, UnmappedField } from './contract.js';

/**
 * Source pages express the same physical fact a dozen ways. Normalization here
 * is deliberately conservative: anything not confidently recognized becomes an
 * unmapped field rather than a guessed number (ADR-055 — fail visible).
 */
type Parsed = { value: number; unit: string } | null;

const NUM = String.raw`(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d*\.?\d+)`;
const num = (s: string) => Number(s.replace(/,/g, ''));

const PATTERNS: readonly { re: RegExp; to: (m: RegExpMatchArray) => Parsed }[] = [
  // "1/8000 sec", "1/250s"
  { re: new RegExp(`^1\\s*/\\s*${NUM}\\s*(?:sec|secs|second|seconds|s)$`, 'i'),
    to: (m) => ({ value: 1 / num(m[1]!), unit: 's' }) },
  // "30 sec", "1.6 s"
  { re: new RegExp(`^${NUM}\\s*(?:sec|secs|second|seconds|s)$`, 'i'),
    to: (m) => ({ value: num(m[1]!), unit: 's' }) },
  // "f/2.8", "F2.8", "1:2.8"
  { re: new RegExp(`^(?:f\\s*/?\\s*|1\\s*:\\s*)${NUM}$`, 'i'),
    to: (m) => ({ value: num(m[1]!), unit: 'fnumber' }) },
  // "ISO 100-51200" → take the ceiling; the floor is a separate attribute
  { re: new RegExp(`^(?:iso\\s*)?${NUM}\\s*(?:-|–|to)\\s*${NUM}$`, 'i'),
    to: (m) => ({ value: num(m[2]!), unit: 'iso' }) },
  { re: new RegExp(`^iso\\s*${NUM}$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'iso' }) },
  // "737 g", "1.53 kg", "26.1 oz", "2.3 lb"
  { re: new RegExp(`^${NUM}\\s*g(?:rams?)?$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'g' }) },
  { re: new RegExp(`^${NUM}\\s*kg$`, 'i'), to: (m) => ({ value: num(m[1]!) * 1000, unit: 'g' }) },
  { re: new RegExp(`^${NUM}\\s*(?:oz|ounces?)$`, 'i'), to: (m) => ({ value: num(m[1]!) * 28.349523125, unit: 'g' }) },
  { re: new RegExp(`^${NUM}\\s*(?:lb|lbs|pounds?)$`, 'i'), to: (m) => ({ value: num(m[1]!) * 453.59237, unit: 'g' }) },
  // "24-70mm", "600 mm"
  { re: new RegExp(`^${NUM}\\s*(?:-|–)\\s*${NUM}\\s*mm$`, 'i'),
    to: (m) => ({ value: num(m[1]!), unit: 'mm' }) },   // caller picks min/max attribute
  { re: new RegExp(`^${NUM}\\s*mm$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'mm' }) },
  // "30 fps", "40fps (electronic)"
  { re: new RegExp(`^${NUM}\\s*fps\\b.*$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'fps' }) },
  // "-6 EV", "EV -4"
  { re: new RegExp(`^(?:ev\\s*)?${NUM}\\s*ev$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'EV' }) },
  { re: new RegExp(`^ev\\s*${NUM}$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'EV' }) },
  // "5.5 stops", "8 stop"
  { re: new RegExp(`^${NUM}\\s*(?:stops?|ev\\s*of\\s*shake)$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'stop' }) },
  // "2280 shots", "580 frames"
  { re: new RegExp(`^(?:approx\\.?\\s*)?${NUM}\\s*(?:shots?|frames?|images?|exposures?)$`, 'i'),
    to: (m) => ({ value: num(m[1]!), unit: 'frame' }) },
  { re: new RegExp(`^${NUM}\\s*ms$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'ms' }) },
  { re: new RegExp(`^${NUM}\\s*(?:mp|megapixels?)$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'Mpx' }) },
  { re: new RegExp(`^${NUM}\\s*(?:mbps|mb/s)$`, 'i'), to: (m) => ({ value: num(m[1]!), unit: 'Mbps' }) },
];

/** Range detection so "24-70mm" yields two drafts instead of a silent truncation. */
const RANGE = new RegExp(`^${NUM}\\s*(?:-|–|to)\\s*${NUM}\\s*(mm|fps|iso)?$`, 'i');

export const parseRange = (text: string): { lo: number; hi: number; unit: string } | null => {
  const m = text.trim().match(RANGE);
  if (!m) return null;
  const unit = (m[3] ?? '').toLowerCase();
  if (unit !== 'mm' && unit !== 'fps' && unit !== 'iso') return null;
  const lo = num(m[1]!);
  const hi = num(m[2]!);
  return hi >= lo ? { lo, hi, unit } : null;
};

export const parseValue = (text: string): Parsed => {
  const t = text.trim().replace(/\s+/g, ' ');
  for (const p of PATTERNS) {
    const m = t.match(p.re);
    if (m) {
      const out = p.to(m);
      if (out && Number.isFinite(out.value)) return out;
    }
  }
  return null;
};

const YES = new Set(['yes', 'y', 'true', 'available', 'included', 'supported', 'standard']);
const NO = new Set(['no', 'n', 'false', 'none', 'not available', 'unsupported', '—', '-', 'n/a']);

export const parseBoolean = (text: string): boolean | null => {
  const t = text.trim().toLowerCase();
  if (YES.has(t)) return true;
  if (NO.has(t)) return false;
  return null;
};

export const unparseable = (
  sourceEntityKey: string,
  label: string,
  rawValue: string,
  reason: UnmappedField['reason'] = 'unparseable_value',
): UnmappedField => ({ sourceEntityKey, label, rawValue, reason });

export const draft = (d: ClaimDraft): ClaimDraft => d;
