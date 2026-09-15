import { describe, expect, it } from 'vitest';
import { canonicalHash } from '@camefa/engine-contracts';
import { verifyReceipt } from '../src/lib/verify.js';

const base = {
  question: { label: 'wedding.documentary under $4000' },
  engine: {
    ontologyFingerprint: 'ont:1',
    modelRef: 'mdl:1',
    calibrationRef: 'cal:1',
    reliabilityFingerprint: 'rel:1',
  },
  outcome: { ranked: [], aggregationP: -0.5 },
  cost: { solverNodes: 12 },
  sealedAt: '2026-01-01T00:00:00.000Z',
  replayable: true,
};

const seal = (payload: object) =>
  ({ receiptId: canonicalHash(payload), ...payload }) as never;

describe('verifyReceipt', () => {
  it('accepts a well-formed sealed receipt', () => {
    const v = verifyReceipt(seal(base));
    expect(v).toMatchObject({ addressMatches: true, replayable: true, reasons: [] });
  });

  it('detects a mutated payload', () => {
    const r = { ...seal(base), sealedAt: '2026-02-02T00:00:00.000Z' } as never;
    expect(verifyReceipt(r).addressMatches).toBe(false);
  });

  it('marks receipts without a calibrationRef unreplayable', () => {
    const payload = { ...base, engine: { ...base.engine, calibrationRef: null } };
    const v = verifyReceipt(seal(payload));
    expect(v.addressMatches).toBe(true);
    expect(v.replayable).toBe(false);
    expect(v.reasons).toContain('missing calibrationRef (ADR-051)');
  });
});
