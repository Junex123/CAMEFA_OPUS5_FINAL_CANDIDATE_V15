import { describe, expect, it } from 'vitest';
import { AGGREGATION_P } from '../src/calibration.js';
import { questionKey, sealReceipt, verifyReceipt, type ReceiptDraft } from '../src/receipt.js';
import type { EngineVersionTriplet } from '../src/version.js';

const engine: EngineVersionTriplet = {
  ontologyFingerprint: 'h1:ont',
  modelRef: 'mdl:1',
  calibrationRef: 'cal:1',
  reliabilityFingerprint: 'rel:1',
  corpusEpoch: 'ep:real1',
  engineVersion: '0.0.0',
};

const draft = (over: Partial<ReceiptDraft> = {}): ReceiptDraft => ({
  question: {
    key: 'q:wedding.documentary@abc',
    label: 'wedding.documentary under $4000',
    activityProfile: 'wedding.documentary',
    constraints: { budgetUsd: 4000 },
  },
  inputs: { claimSetHash: 'h1:claims', claimCount: 412, contestedSlotCount: 3, quarantinedSlotCount: 1 },
  engine,
  outcome: {
    aggregationP: AGGREGATION_P,
    ranked: [
      { entityId: 'e:1', label: 'A', score: 0.71, confidence: 0.88, eliminated: false, binding: null },
    ],
    excluded: [],
  },
  cost: { solverNodes: 1204 },
  sensitivity: null,
  leverage: [],
  replacesReceiptId: null,
  sealedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('sealReceipt', () => {
  it('derives replayability rather than trusting the caller', () => {
    const partial = draft({ engine: { ...engine, calibrationRef: null } });
    expect(sealReceipt(partial).replayable).toBe(false);
    expect(sealReceipt(draft()).replayable).toBe(true);
  });

  it('is deterministic for the same draft', () => {
    expect(sealReceipt(draft()).receiptId).toBe(sealReceipt(draft()).receiptId);
  });

  it('changes address when replayability changes', () => {
    const a = sealReceipt(draft());
    const b = sealReceipt(draft({ engine: { ...engine, corpusEpoch: null } }));
    expect(a.receiptId).not.toBe(b.receiptId);
  });
});

describe('verifyReceipt', () => {
  it('accepts a freshly sealed receipt', () => {
    expect(verifyReceipt(sealReceipt(draft()))).toMatchObject({
      addressMatches: true,
      replayable: true,
      reasons: [],
    });
  });

  it('detects a payload mutated after sealing', () => {
    const r = sealReceipt(draft());
    const tampered = { ...r, sealedAt: '2026-06-01T00:00:00.000Z' };
    const v = verifyReceipt(tampered);
    expect(v.addressMatches).toBe(false);
    expect(v.reasons[0]).toBe('content address mismatch');
  });

  it('names every missing version dimension', () => {
    const r = sealReceipt(
      draft({ engine: { ...engine, calibrationRef: null, corpusEpoch: null } }),
    );
    const v = verifyReceipt(r);
    expect(v.addressMatches).toBe(true);
    expect(v.reasons).toEqual(['missing calibrationRef', 'missing corpusEpoch']);
  });
});

describe('questionKey', () => {
  it('is stable across constraint key order', () => {
    expect(questionKey('travel.light', { budgetUsd: 2000, weightG: 900 })).toBe(
      questionKey('travel.light', { weightG: 900, budgetUsd: 2000 }),
    );
  });

  it('separates different profiles', () => {
    expect(questionKey('a', { x: 1 })).not.toBe(questionKey('b', { x: 1 }));
  });
});
