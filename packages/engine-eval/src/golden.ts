import { canonicalHash } from '@camefa/engine-contracts';

export type ExpectationProvenance = 'anchor' | 'editorial';

/**
 * `anchor` expectations trace to an independently verified measurement
 * (ADR-066) and are blocking. `editorial` expectations encode a human's taste
 * and are advisory only — blocking on them would recreate the consensus
 * feedback loop the anchor split exists to break.
 */
export interface Expectation {
  id: string;
  provenance: ExpectationProvenance;
  anchorId?: string;
  rationale: string;
  assert:
    | { kind: 'ranks_above'; winner: string; loser: string }
    | { kind: 'in_top_n'; entityId: string; n: number }
    | { kind: 'eliminated'; entityId: string; requirement: string }
    | { kind: 'not_eliminated'; entityId: string };
}

export interface GoldenQuestion {
  questionKey: string;
  label: string;
  request: unknown;
  stratum: string;
  baselineReceiptId: string | null;
  expectations: Expectation[];
}

export interface GoldenSet {
  setId: string;
  /** Content address of the corpus; a changed gate input must change this. */
  fingerprint: string;
  questions: GoldenQuestion[];
  strata: Record<string, number>;
}

export interface Waiver {
  questionKey: string;
  reason: string;
  /** Waivers die with the change they excuse. */
  boundToCalibrationRef: string;
  expiresAt: string;
  approvedBy: string;
}

export class GoldenSetError extends Error {}

export function buildGoldenSet(
  setId: string,
  questions: GoldenQuestion[],
): GoldenSet {
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.questionKey)) {
      throw new GoldenSetError(`duplicate questionKey: ${q.questionKey}`);
    }
    seen.add(q.questionKey);
    for (const e of q.expectations) {
      if (e.provenance === 'anchor' && !e.anchorId) {
        throw new GoldenSetError(
          `expectation ${e.id} claims anchor provenance without an anchorId`,
        );
      }
      if (!e.rationale.trim()) {
        throw new GoldenSetError(`expectation ${e.id} has no rationale`);
      }
    }
  }

  const strata: Record<string, number> = {};
  for (const q of questions) strata[q.stratum] = (strata[q.stratum] ?? 0) + 1;

  const ordered = [...questions].sort((x, y) =>
    x.questionKey.localeCompare(y.questionKey),
  );

  return {
    setId,
    fingerprint: canonicalHash({ setId, questions: ordered }),
    questions: ordered,
    strata,
  };
}

export function activeWaivers(
  waivers: readonly Waiver[],
  candidateCalibrationRef: string | null,
  now: Date,
): { active: Waiver[]; stale: Waiver[] } {
  const active: Waiver[] = [];
  const stale: Waiver[] = [];
  for (const w of waivers) {
    const expired = new Date(w.expiresAt).getTime() <= now.getTime();
    const rebound = w.boundToCalibrationRef !== candidateCalibrationRef;
    (expired || rebound ? stale : active).push(w);
  }
  return { active, stale };
}
