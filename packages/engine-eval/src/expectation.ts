import type { DecisionReceipt } from '@camefa/engine-contracts';
import type { Expectation } from './golden.js';

export interface ExpectationResult {
  expectationId: string;
  provenance: Expectation['provenance'];
  satisfied: boolean;
  detail: string;
}

interface Row {
  entityId: string;
  index: number;
  eliminated: boolean;
  binding: { requirement: string } | null;
}

function index(receipt: DecisionReceipt): Map<string, Row> {
  const live = receipt.outcome.ranked.filter((r) => !r.eliminated);
  const liveRank = new Map(live.map((r, i) => [r.entityId, i]));
  return new Map(
    receipt.outcome.ranked.map((r) => [
      r.entityId,
      {
        entityId: r.entityId,
        index: liveRank.get(r.entityId) ?? Number.POSITIVE_INFINITY,
        eliminated: r.eliminated,
        binding: r.binding ?? null,
      },
    ]),
  );
}

export function checkExpectations(
  receipt: DecisionReceipt,
  expectations: readonly Expectation[],
): ExpectationResult[] {
  const rows = index(receipt);

  return expectations.map((e) => {
    const fail = (detail: string): ExpectationResult => ({
      expectationId: e.id,
      provenance: e.provenance,
      satisfied: false,
      detail,
    });
    const pass = (detail: string): ExpectationResult => ({
      expectationId: e.id,
      provenance: e.provenance,
      satisfied: true,
      detail,
    });

    switch (e.assert.kind) {
      case 'ranks_above': {
        const w = rows.get(e.assert.winner);
        const l = rows.get(e.assert.loser);
        if (!w) return fail(`${e.assert.winner} absent from outcome`);
        if (!l) return fail(`${e.assert.loser} absent from outcome`);
        if (w.eliminated) return fail(`${e.assert.winner} was eliminated`);
        return w.index < l.index
          ? pass(`${e.assert.winner} #${w.index + 1} above #${l.index + 1}`)
          : fail(
              `${e.assert.winner} #${w.index + 1} not above ${e.assert.loser} #${l.index + 1}`,
            );
      }
      case 'in_top_n': {
        const r = rows.get(e.assert.entityId);
        if (!r || r.eliminated) return fail(`${e.assert.entityId} not ranked`);
        return r.index < e.assert.n
          ? pass(`rank ${r.index + 1} ≤ ${e.assert.n}`)
          : fail(`rank ${r.index + 1} > ${e.assert.n}`);
      }
      case 'eliminated': {
        const r = rows.get(e.assert.entityId);
        if (!r) return fail(`${e.assert.entityId} absent from outcome`);
        if (!r.eliminated) return fail(`${e.assert.entityId} survived`);
        // Eliminated for the wrong reason is still a modelling failure.
        return r.binding?.requirement === e.assert.requirement
          ? pass(`eliminated by ${e.assert.requirement}`)
          : fail(
              `eliminated by ${r.binding?.requirement ?? 'unknown'}, expected ${e.assert.requirement}`,
            );
      }
      case 'not_eliminated': {
        const r = rows.get(e.assert.entityId);
        if (!r) return fail(`${e.assert.entityId} absent from outcome`);
        return r.eliminated
          ? fail(`eliminated by ${r.binding?.requirement ?? 'unknown'}`)
          : pass(`survived at rank ${r.index + 1}`);
      }
    }
  });
}
