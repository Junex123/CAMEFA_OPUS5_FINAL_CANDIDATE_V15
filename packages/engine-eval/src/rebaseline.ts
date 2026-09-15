import { canonicalHash, type DecisionReceipt } from '@camefa/engine-contracts';
import type { GoldenSet } from './golden.js';
import type { ReplayEngine } from './replay.js';

export interface RebaselineRequest {
  set: GoldenSet;
  /** The engine configuration currently in production. */
  shippedEngine: ReplayEngine;
  /** Candidate config, if one exists. Present only to be refused. */
  candidateEngine: ReplayEngine | null;
  corpusEpoch: string;
  previousEpoch: string | null;
  reason: string;
  approvedBy: string;
}

export interface RebaselineRefusal {
  code:
    | 'candidate_config_present'
    | 'epoch_unchanged'
    | 'no_reason'
    | 'coverage_insufficient';
  message: string;
}

export class RebaselineRefused extends Error {
  constructor(readonly refusals: RebaselineRefusal[]) {
    super(refusals.map((r) => `${r.code}: ${r.message}`).join('; '));
  }
}

/**
 * Rebaselining is the one operation that can silently destroy the gate.
 *
 * The tempting implementation seals baselines using the engine config sitting
 * in the working tree — which, at the moment anyone reaches for this command,
 * is the config they are trying to ship. That bakes the change under review
 * into the reference it will be measured against, and every subsequent run
 * compares the candidate to itself. The gate stays green forever and nobody
 * finds out until a user does.
 *
 * So: baselines are sealed under the SHIPPED config only, with the corpus
 * swapped underneath it. The candidate change is then measured against those
 * baselines as an ordinary gate run, with exactly one moving dimension.
 */
export function assertRebaselinable(req: RebaselineRequest): void {
  const refusals: RebaselineRefusal[] = [];

  if (req.candidateEngine !== null) {
    const shipped = req.shippedEngine.version;
    const cand = req.candidateEngine.version;
    const drift = (
      ['ontologyFingerprint', 'modelRef', 'calibrationRef'] as const
    ).filter((k) => shipped[k] !== cand[k]);
    if (drift.length > 0) {
      refusals.push({
        code: 'candidate_config_present',
        message:
          `candidate engine differs from shipped in ${drift.join(', ')}. ` +
          'Rebaseline the corpus swap alone, land it, then run the gate on the candidate (ADR-071).',
      });
    }
  }

  if (req.previousEpoch !== null && req.previousEpoch === req.corpusEpoch) {
    refusals.push({
      code: 'epoch_unchanged',
      message:
        `corpus epoch is still ${req.corpusEpoch}; existing baselines are valid and resealing them would only discard history`,
    });
  }

  if (!req.reason.trim() || !req.approvedBy.trim()) {
    refusals.push({
      code: 'no_reason',
      message: 'rebaseline requires --reason and --approved-by; it is an audited act',
    });
  }

  if (refusals.length > 0) throw new RebaselineRefused(refusals);
}

export interface SealedBaseline {
  questionKey: string;
  receiptId: string;
  corpusEpoch: string;
  sealedAt: string;
}

export interface BaselineWriter {
  put(entry: SealedBaseline, receipt: DecisionReceipt): Promise<void>;
  /** Prior baselines are retained, never overwritten in place. */
  archive(epoch: string): Promise<number>;
}

export interface RebaselineReport {
  baselineSetId: string;
  corpusEpoch: string;
  previousEpoch: string | null;
  reason: string;
  approvedBy: string;
  sealedAt: string;
  engine: DecisionReceipt['engine'];
  sealed: SealedBaseline[];
  failed: { questionKey: string; error: string }[];
  archivedCount: number;
  /** Anchor expectations that held under the new corpus, per question. */
  anchorStatus: { questionKey: string; passed: number; failed: number }[];
}

export async function rebaseline(
  req: RebaselineRequest,
  writer: BaselineWriter,
  checkAnchors: (
    r: DecisionReceipt,
    questionKey: string,
  ) => { passed: number; failed: number },
): Promise<RebaselineReport> {
  assertRebaselinable(req);

  const sealedAt = new Date().toISOString();
  const sealed: SealedBaseline[] = [];
  const failed: RebaselineReport['failed'] = [];
  const anchorStatus: RebaselineReport['anchorStatus'] = [];

  for (const q of req.set.questions) {
    try {
      const { receipt } = await req.shippedEngine.evaluate(q.request, {
        onCost: () => {},
      });
      const entry: SealedBaseline = {
        questionKey: q.questionKey,
        receiptId: receipt.receiptId,
        corpusEpoch: req.corpusEpoch,
        sealedAt,
      };
      await writer.put(entry, receipt);
      sealed.push(entry);
      anchorStatus.push({ questionKey: q.questionKey, ...checkAnchors(receipt, q.questionKey) });
    } catch (err) {
      failed.push({ questionKey: q.questionKey, error: (err as Error).message });
    }
  }

  const archivedCount = req.previousEpoch
    ? await writer.archive(req.previousEpoch)
    : 0;

  return {
    baselineSetId: canonicalHash({
      setId: req.set.setId,
      goldenFingerprint: req.set.fingerprint,
      corpusEpoch: req.corpusEpoch,
      sealed: sealed.map((s) => s.receiptId),
    }).slice(0, 16),
    corpusEpoch: req.corpusEpoch,
    previousEpoch: req.previousEpoch,
    reason: req.reason,
    approvedBy: req.approvedBy,
    sealedAt,
    engine: req.shippedEngine.version,
    sealed,
    failed,
    archivedCount,
    anchorStatus,
  };
}

/**
 * A rebaseline that seals anchor-violating decisions as the new reference makes
 * those violations invisible from then on. Anchors survive corpus swaps by
 * construction — they are independent measurements — so a failure here means
 * the new corpus is wrong, not that the anchor is stale.
 */
export function anchorRegressionsInBaseline(
  report: RebaselineReport,
): { questionKey: string; failed: number }[] {
  return report.anchorStatus.filter((a) => a.failed > 0);
}
