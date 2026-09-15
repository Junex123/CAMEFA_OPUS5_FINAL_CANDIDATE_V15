import type { DecisionReceipt } from './receipt.js';

export const DIFF_DIMENSIONS = ['build', 'ontology', 'capability', 'reasoning'] as const;
export type DiffDimension = (typeof DIFF_DIMENSIONS)[number];

export type Attribution =
  | { kind: 'identical' }
  | { kind: 'attributable'; dimensions: DiffDimension[] }
  | { kind: 'unattributable'; reason: 'determinism_violation' }
  | { kind: 'incomparable'; reason: string };

export interface RankRow {
  slot: string;
  rankA: number | null;
  rankB: number | null;
  scoreA: number | null;
  scoreB: number | null;
  scoreDelta: number | null;
  rankDelta: number | null;
  movement: 'entered' | 'left' | 'up' | 'down' | 'held';
}

export interface ReceiptDiff {
  a: string;
  b: string;
  attribution: Attribution;
  changed: DiffDimension[];
  versions: Record<DiffDimension, { a: string | null; b: string | null }>;
  rows: RankRow[];
  winnerChanged: boolean;
  winnerA: string | null;
  winnerB: string | null;
  tau: { discordant: number; pairs: number; normalized: number };
  eliminationFlips: { slot: string; to: 'in' | 'out' }[];
  maxScoreDelta: number;
}

function rankIds(r: DecisionReceipt): readonly string[] {
  return r.decision.ranking.map((x) => String(x.slot));
}

function dim(r: DecisionReceipt, d: DiffDimension): string | null {
  const v = r.versions[d];
  return v === undefined ? null : String(v);
}

export function kendallTauDistance(orderA: readonly string[], orderB: readonly string[]) {
  const rankB = new Map(orderB.map((id, i) => [id, i]));
  const seq = orderA.filter((id) => rankB.has(id)).map((id) => rankB.get(id)!);
  let discordant = 0;
  for (let i = 0; i < seq.length; i += 1) {
    for (let j = i + 1; j < seq.length; j += 1) if (seq[i]! > seq[j]!) discordant += 1;
  }
  const pairs = (seq.length * (seq.length - 1)) / 2;
  return { discordant, pairs, normalized: pairs === 0 ? 0 : discordant / pairs };
}

export function diffReceipts(a: DecisionReceipt, b: DecisionReceipt): ReceiptDiff {
  const versions = Object.fromEntries(
    DIFF_DIMENSIONS.map((d) => [d, { a: dim(a, d), b: dim(b, d) }]),
  ) as ReceiptDiff['versions'];
  const changed = DIFF_DIMENSIONS.filter((d) => versions[d].a !== versions[d].b);
  const orderA = rankIds(a);
  const orderB = rankIds(b);
  const indexA = new Map(orderA.map((slot, i) => [slot, i]));
  const indexB = new Map(orderB.map((slot, i) => [slot, i]));
  const ids = [...new Set([...orderA, ...orderB])];
  const rows = ids.map((slot): RankRow => {
    const ia = indexA.get(slot);
    const ib = indexB.get(slot);
    const rankA = ia === undefined ? null : ia + 1;
    const rankB = ib === undefined ? null : ib + 1;
    const ca = a.decision.ranking[ia ?? -1]?.score ?? null;
    const cb = b.decision.ranking[ib ?? -1]?.score ?? null;
    let movement: RankRow['movement'] = 'held';
    if (ia === undefined) movement = 'entered';
    else if (ib === undefined) movement = 'left';
    else if (rankB! < rankA!) movement = 'up';
    else if (rankB! > rankA!) movement = 'down';
    return { slot, rankA, rankB, scoreA: ca, scoreB: cb, scoreDelta: ca !== null && cb !== null ? cb - ca : null, rankDelta: rankA !== null && rankB !== null ? rankA - rankB : null, movement };
  });
  rows.sort((x, y) => Math.abs(y.rankDelta ?? 99) - Math.abs(x.rankDelta ?? 99) || (x.rankB ?? 999) - (y.rankB ?? 999));
  const winnerA = a.decision.winner === null ? null : String(a.decision.winner);
  const winnerB = b.decision.winner === null ? null : String(b.decision.winner);
  const tau = kendallTauDistance(orderA, orderB);
  const orderChanged = tau.discordant > 0 || winnerA !== winnerB || rows.some((r) => r.movement !== 'held' || (r.scoreDelta ?? 0) !== 0);
  let attribution: Attribution;
  if (a.request.profile !== b.request.profile) attribution = { kind: 'incomparable', reason: 'receipts answer different profiles' };
  else if (!orderChanged && changed.length === 0) attribution = { kind: 'identical' };
  else if (changed.length > 0) attribution = { kind: 'attributable', dimensions: changed };
  else attribution = { kind: 'unattributable', reason: 'determinism_violation' };
  return {
    a: a.receiptId,
    b: b.receiptId,
    attribution,
    changed,
    versions,
    rows,
    winnerChanged: winnerA !== winnerB,
    winnerA,
    winnerB,
    tau,
    eliminationFlips: [],
    maxScoreDelta: rows.reduce((m, r) => Math.max(m, Math.abs(r.scoreDelta ?? 0)), 0),
  };
}
