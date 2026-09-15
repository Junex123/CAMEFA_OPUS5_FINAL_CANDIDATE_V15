import { createHash } from 'node:crypto';

export const stableStringify = (input: unknown): string => {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (src[k] !== undefined) out[k] = walk(src[k]);
    }
    return out;
  };
  return JSON.stringify(walk(input));
};

export const sha256 = (input: unknown): string =>
  createHash('sha256').update(stableStringify(input), 'utf8').digest('hex');

/** Historical name retained as a compatibility alias; both are SHA-256 over canonical data. */
export const contentHash = sha256;
