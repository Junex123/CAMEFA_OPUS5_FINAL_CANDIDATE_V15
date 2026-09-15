import { describe, expect, it, vi } from 'vitest';
import {
  anchorRegressionsInBaseline,
  assertRebaselinable,
  rebaseline,
  RebaselineRefused,
  type BaselineWriter,
} from '../src/rebaseline.js';
import { buildGoldenSet } from '../src/golden.js';

const engineOf = (over: Record<string, string> = {}) => ({
  version: {
    ontologyFingerprint: 'ont:1',
    modelRef: 'mdl:1',
    calibrationRef: 'cal:1',
    reliabilityFingerprint: 'rel:1',
    ...over,
  },
  evaluate: vi.fn(async () => ({
    receipt: { receiptId: `r:${Math.random().toString(36).slice(2)}` },
  })),
}) as never;

const set = buildGoldenSet('core', [
  { questionKey: 'q:1', label: 'q1', request: {}, stratum: 's', baselineReceiptId: null, expectations: [] },
  { questionKey: 'q:2', label: 'q2', request: {}, stratum: 's', baselineReceiptId: null, expectations: [] },
]);

const base = {
  set,
  shippedEngine: engineOf(),
  candidateEngine: null,
  corpusEpoch: 'ep:real1',
  previousEpoch: 'ep:syn0',
  reason: 'first real ingestion run',
  approvedBy: 'ops',
};

const writer = (): BaselineWriter => ({
  put: vi.fn(async () => {}),
  archive: vi.fn(async () => 31),
});

describe('assertRebaselinable', () => {
  it('refuses to seal baselines while a candidate config is in the tree', () => {
    try {
      assertRebaselinable({ ...base, candidateEngine: engineOf({ calibrationRef: 'cal:2' }) });
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(RebaselineRefused);
      expect((e as RebaselineRefused).refusals[0].code).toBe('candidate_config_present');
    }
  });

  it('allows a candidate config identical to shipped', () => {
    expect(() => assertRebaselinable({ ...base, candidateEngine: engineOf() })).not.toThrow();
  });

  it('refuses when the corpus epoch has not moved', () => {
    expect(() =>
      assertRebaselinable({ ...base, previousEpoch: 'ep:real1' }),
    ).toThrow(/epoch_unchanged/);
  });

  it('requires a reason and an approver', () => {
    expect(() => assertRebaselinable({ ...base, reason: '  ' })).toThrow(/no_reason/);
    expect(() => assertRebaselinable({ ...base, approvedBy: '' })).toThrow(/no_reason/);
  });

  it('permits the very first rebaseline with no previous epoch', () => {
    expect(() => assertRebaselinable({ ...base, previousEpoch: null })).not.toThrow();
  });
});

describe('rebaseline', () => {
  it('seals every question under the shipped engine and archives the old epoch', async () => {
    const w = writer();
    const report = await rebaseline(base, w, () => ({ passed: 2, failed: 0 }));
    expect(report.sealed).toHaveLength(2);
    expect(report.engine.calibrationRef).toBe('cal:1');
    expect(w.archive).toHaveBeenCalledWith('ep:syn0');
    expect(report.archivedCount).toBe(31);
  });

  it('records per-question failures without aborting the batch', async () => {
    const engine = {
      version: engineOf().version,
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({ receipt: { receiptId: 'r:1' } })
        .mockRejectedValueOnce(new Error('resolution quarantined')),
    } as never;
    const report = await rebaseline({ ...base, shippedEngine: engine }, writer(), () => ({
      passed: 1,
      failed: 0,
    }));
    expect(report.sealed).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({ questionKey: 'q:2' });
  });

  it('surfaces anchor violations rather than sealing them as the new truth', async () => {
    const report = await rebaseline(base, writer(), (_r, key) => ({
      passed: 0,
      failed: key === 'q:2' ? 1 : 0,
    }));
    expect(anchorRegressionsInBaseline(report)).toEqual([{ questionKey: 'q:2', failed: 1 }]);
  });

  it('derives a stable baseline set id from golden set, epoch and receipts', async () => {
    const a = await rebaseline(base, writer(), () => ({ passed: 0, failed: 0 }));
    const b = await rebaseline(base, writer(), () => ({ passed: 0, failed: 0 }));
    // Receipt ids differ per run, so ids must differ — the id identifies the seal, not the intent.
    expect(a.baselineSetId).not.toBe(b.baselineSetId);
    expect(a.corpusEpoch).toBe(b.corpusEpoch);
  });
});
