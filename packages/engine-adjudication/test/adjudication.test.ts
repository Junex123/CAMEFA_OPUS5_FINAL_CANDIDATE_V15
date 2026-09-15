import { describe, it, expect } from 'vitest';
import { detectConflicts } from '../src/conflict.js';
import { prioritize } from '../src/queue.js';
import { presentBlind, optionTokenMap } from '../src/blind.js';
import { recordAdjudication, projectResolution } from '../src/decision.js';
import { calibrateReviewer, shouldDoubleRoute, OVERLAP_FRACTION } from '../src/agreement.js';
import { testOntology, mkClaim } from '@camefa/engine-testkit';

const ont = testOntology();
const at = '2026-03-01T00:00:00.000Z';

describe('conflict detection', () => {
  it('ignores disagreement inside one JND as measurement noise', () => {
    const conflicts = detectConflicts([
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 737, unit: 'g' }, sourceId: 's1' }),
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 738, unit: 'g' }, sourceId: 's2' }),
    ], ont);
    expect(conflicts).toHaveLength(0);
  });

  it('escalates severity with JND spread', () => {
    const spread = (v: number) => detectConflicts([
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 737, unit: 'g' }, sourceId: 's1' }),
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: v, unit: 'g' }, sourceId: 's2' }),
    ], ont)[0]?.severity;

    expect(spread(760)).toBe('minor');
    expect(spread(860)).toBe('material');
    expect(spread(7370)).toBe('contradictory');
  });

  it('does not treat a spec change over time as a conflict', () => {
    const conflicts = detectConflicts([
      mkClaim({ entityId: 'b1', attributeKey: 'commerce.price', value: { kind: 'quantity', value: 649900, unit: 'USD_minor' }, sourceId: 's1', validFrom: '2026-01-01T00:00:00.000Z', validTo: '2026-02-01T00:00:00.000Z' }),
      mkClaim({ entityId: 'b1', attributeKey: 'commerce.price', value: { kind: 'quantity', value: 549900, unit: 'USD_minor' }, sourceId: 's2', validFrom: '2026-02-01T00:00:00.000Z', validTo: null }),
    ], ont);
    expect(conflicts).toHaveLength(0);
  });

  it('never treats one source disagreeing with itself as a conflict', () => {
    expect(detectConflicts([
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 737, unit: 'g' }, sourceId: 's1' }),
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 900, unit: 'g' }, sourceId: 's1' }),
    ], ont)).toHaveLength(0);
  });

  it('counts majority per distinct source, not per claim', () => {
    const c = detectConflicts([
      mkClaim({ entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 2, unit: 'count' }, sourceId: 'mirror_a' }),
      mkClaim({ entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 2, unit: 'count' }, sourceId: 'mirror_b' }),
      mkClaim({ entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 1, unit: 'count' }, sourceId: 'spec_sheet' }),
      mkClaim({ entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 1, unit: 'count' }, sourceId: 'review' }),
    ], ont)[0]!;
    expect(c.deadlocked).toBe(true);
  });

  it('skips retracted claims', () => {
    expect(detectConflicts([
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 737, unit: 'g' }, sourceId: 's1' }),
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 7370, unit: 'g' }, sourceId: 's2', retractedAt: at }),
    ], ont)).toHaveLength(0);
  });
});

describe('queue prioritization', () => {
  const base = {
    attributeDemand: new Map([['body.card_slots', 900], ['sensor.type', 40]]),
    hardGated: new Set(['body.card_slots']),
    entitySalience: new Map([['b1', 0.4], ['b_obscure', 0.01]]),
    quarantined: [],
  };

  const conflict = (entityId: string, attributeKey: string, value: number) =>
    detectConflicts([
      mkClaim({ entityId, attributeKey, value: { kind: 'quantity', value: 2, unit: 'count' }, sourceId: 's1' }),
      mkClaim({ entityId, attributeKey, value: { kind: 'quantity', value, unit: 'count' }, sourceId: 's2' }),
    ], ont)[0]!;

  it('puts a hard-gated conflict on popular gear first', () => {
    const q = prioritize({
      ...base,
      conflicts: [conflict('b_obscure', 'sensor.type', 9), conflict('b1', 'body.card_slots', 1)],
    });
    expect(q[0]!.attributeKey).toBe('body.card_slots');
    expect(q[0]!.blocksHardGate).toBe(true);
  });

  it('drops noise-severity items from the queue entirely', () => {
    const noise = detectConflicts([
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 737, unit: 'g' }, sourceId: 's1' }),
      mkClaim({ entityId: 'b1', attributeKey: 'body.mass', value: { kind: 'quantity', value: 737.2, unit: 'g' }, sourceId: 's2' }),
    ], ont);
    expect(prioritize({ ...base, conflicts: noise })).toHaveLength(0);
  });

  it('prefers cheap-and-valuable over expensive-and-valuable', () => {
    const q = prioritize({ ...base, conflicts: [conflict('b1', 'body.card_slots', 1)] });
    expect(q[0]!.effortSeconds).toBeLessThan(120);
    expect(q[0]!.priorityScore).toBeGreaterThan(0);
  });
});

describe('blind presentation', () => {
  const conflict = detectConflicts([
    mkClaim({ entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 2, unit: 'count' }, sourceId: 'manufacturer.spec', provenance: { excerpt: 'Dual CFexpress Type B / SD slots' } }),
    mkClaim({ entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 1, unit: 'count' }, sourceId: 'forum.post', provenance: { excerpt: 'single slot only' } }),
  ], ont)[0]!;

  const present = () => presentBlind({
    conflict, entityLabel: 'AX Flagship', attributeLabel: 'Card slots',
    attributeDescription: 'Number of independent recording media slots.',
    unit: 'count', cohort: [1, 1, 2, 2, 2, 2, 2],
  });

  it('leaks no source identity in the payload', () => {
    const json = JSON.stringify(present());
    expect(json).not.toContain('manufacturer');
    expect(json).not.toContain('forum');
  });

  it('shows the verbatim excerpt so evidence, not authority, is judged', () => {
    expect(present().options.map((o) => o.excerpt)).toEqual(
      expect.arrayContaining(['Dual CFexpress Type B / SD slots', 'single slot only']),
    );
  });

  it('orders options deterministically but independently of source', () => {
    expect(present().options.map((o) => o.value)).toEqual(present().options.map((o) => o.value));
  });

  it('withholds a cohort summary too small to inform', () => {
    const p = presentBlind({ conflict, entityLabel: 'x', attributeLabel: 'y', attributeDescription: 'z', unit: 'count', cohort: [2, 2] });
    expect(p.cohortSummary).toBeNull();
  });
});

describe('recording adjudications', () => {
  const conflict = detectConflicts([
    mkClaim({ id: 'c_right', entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 2, unit: 'count' }, sourceId: 'good' }),
    mkClaim({ id: 'c_wrong', entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 1, unit: 'count' }, sourceId: 'bad' }),
  ], ont)[0]!;
  const presentation = presentBlind({ conflict, entityLabel: 'x', attributeLabel: 'y', attributeDescription: 'z', unit: 'count', cohort: [1, 2, 2, 2, 2] });
  const tokenFor = (value: number) =>
    presentation.options.find((o) => (o.value as { value: number }).value === value)!.optionToken;

  const submit = (over: Partial<Parameters<typeof recordAdjudication>[0]> = {}) =>
    recordAdjudication({
      presentation, conflict, reviewerId: 'r1', at,
      verdict: { kind: 'select', optionToken: tokenFor(2) },
      certainty: 4, elapsedMs: 18_000, unblindReason: null, reviewerSourceIds: [],
      ...over,
    });

  it('emits one agreement and one disagreement, one vote per source', () => {
    const r = submit();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.adjudications).toEqual([
      { sourceId: 'good', attributeKey: 'body.card_slots', outcome: 'agreed', at },
      { sourceId: 'bad', attributeKey: 'body.card_slots', outcome: 'disagreed', at },
    ]);
  });

  it('contributes nothing to reliability when the reviewer unblinded', () => {
    const r = submit({ unblindReason: 'needed to check the manual' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.event.blinded).toBe(false);
      expect(r.value.adjudications).toHaveLength(0);
    }
  });

  it('contributes nothing when the reviewer was unsure', () => {
    const r = submit({ certainty: 2 });
    expect(r.ok && r.value.adjudications).toHaveLength(0);
  });

  it('refuses a verdict too fast to be a reading', () => {
    const r = submit({ elapsedMs: 400 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SUSPICIOUS_LATENCY');
  });

  it('refuses a reviewer with a stake in one of the sources', () => {
    const r = submit({ reviewerSourceIds: ['bad'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('REVIEWER_NOT_ELIGIBLE');
  });

  it('records abstention as an event with no reliability signal', () => {
    const r = submit({ verdict: { kind: 'abstain', note: 'both plausible' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.event.verdict.kind).toBe('abstain');
      expect(r.value.adjudications).toHaveLength(0);
    }
  });

  it('is idempotent — the same submission yields the same eventId', () => {
    const a = submit();
    const b = submit();
    expect(a.ok && b.ok && a.value.event.eventId === b.value.event.eventId).toBe(true);
  });
});

describe('resolution projection', () => {
  const conflict = detectConflicts([
    mkClaim({ id: 'c_a', entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 2, unit: 'count' }, sourceId: 's1' }),
    mkClaim({ id: 'c_b', entityId: 'b1', attributeKey: 'body.card_slots', value: { kind: 'quantity', value: 1, unit: 'count' }, sourceId: 's2' }),
  ], ont)[0]!;
  const tokens = [...optionTokenMap(conflict).entries()];
  const tokenA = tokens.find(([, ids]) => ids.includes('c_a'))![0];
  const tokenB = tokens.find(([, ids]) => ids.includes('c_b'))![0];

  const ev = (reviewerId: string, optionToken: string) => ({
    eventId: `${reviewerId}:${optionToken}`, conflictId: conflict.conflictId, reviewerId, at,
    verdict: { kind: 'select' as const, optionToken }, blinded: true, unblindReason: null,
    certainty: 4 as const, elapsedMs: 12_000,
  });

  it('requires concurrence on a contradictory conflict', () => {
    expect(projectResolution(conflict, [ev('r1', tokenA)]).status).toBe('open');
    const done = projectResolution(conflict, [ev('r1', tokenA), ev('r2', tokenA)]);
    expect(done.status).toBe('resolved');
    expect(done.winningClaimIds).toEqual(['c_a']);
    expect(done.supersededClaimIds).toEqual(['c_b']);
  });

  it('does not let one reviewer concur with themselves', () => {
    const twice = [ev('r1', tokenA), { ...ev('r1', tokenA), eventId: 'again', at: '2026-03-02T00:00:00.000Z' }];
    expect(projectResolution(conflict, twice).status).toBe('open');
  });

  it('marks a split decision contested rather than picking a winner', () => {
    expect(projectResolution(conflict, [ev('r1', tokenA), ev('r2', tokenB)]).status).toBe('contested');
  });

  it('escalation overrides any accumulated selections', () => {
    const escalated = projectResolution(conflict, [
      ev('r1', tokenA), ev('r2', tokenA),
      { ...ev('r3', tokenA), verdict: { kind: 'escalate', note: 'need the unit in hand' } } as never,
    ]);
    expect(escalated.status).toBe('escalated');
    expect(escalated.winningClaimIds).toHaveLength(0);
  });
});

describe('reviewer calibration', () => {
  const mkEvents = (reviewerId: string, agreeCount: number, disagreeCount: number, certainty: 1 | 2 | 3 | 4 | 5 = 4) => {
    const events = [];
    for (let i = 0; i < agreeCount; i++) events.push({ eventId: `a${i}`, conflictId: `k${i}`, reviewerId, at, verdict: { kind: 'select' as const, optionToken: 'right' }, blinded: true, unblindReason: null, certainty, elapsedMs: 10_000 });
    for (let i = 0; i < disagreeCount; i++) events.push({ eventId: `d${i}`, conflictId: `x${i}`, reviewerId, at, verdict: { kind: 'select' as const, optionToken: 'wrong' }, blinded: true, unblindReason: null, certainty, elapsedMs: 10_000 });
    return events;
  };
  const consensus = new Map([
    ...Array.from({ length: 40 }, (_, i) => [`k${i}`, 'right'] as const),
    ...Array.from({ length: 40 }, (_, i) => [`x${i}`, 'right'] as const),
  ]);

  it('treats a reviewer with too little overlap as a trainee, not a failure', () => {
    const c = calibrateReviewer({ reviewerId: 'r_new', events: mkEvents('r_new', 4, 0), consensus });
    expect(c.status).toBe('trainee');
    expect(c.kappa).toBeNull();
    expect(c.voteWeight).toBeGreaterThan(0);
    expect(c.voteWeight).toBeLessThan(1);
  });

  it('gives a well-calibrated reviewer near-full weight', () => {
    const c = calibrateReviewer({ reviewerId: 'r_good', events: mkEvents('r_good', 28, 2), consensus });
    expect(c.status).toBe('active');
    expect(c.kappa!).toBeGreaterThan(0.8);
    expect(c.voteWeight).toBeGreaterThan(0.9);
  });

  it('zeroes the weight of a reviewer at chance agreement', () => {
    const c = calibrateReviewer({ reviewerId: 'r_bad', events: mkEvents('r_bad', 8, 22), consensus });
    expect(c.status).toBe('flagged');
    expect(c.voteWeight).toBe(0);
  });

  it('surfaces overconfidence separately from raw accuracy', () => {
    const c = calibrateReviewer({ reviewerId: 'r_cocky', events: mkEvents('r_cocky', 10, 20, 5), consensus });
    expect(c.overconfidenceRate!).toBeGreaterThan(0.6);
  });

  it('double-routes a stable, unbiased fraction of items', () => {
    const ids = Array.from({ length: 5_000 }, (_, i) => `item-${i}`);
    const rate = ids.filter(shouldDoubleRoute).length / ids.length;
    expect(rate).toBeGreaterThan(OVERLAP_FRACTION - 0.03);
    expect(rate).toBeLessThan(OVERLAP_FRACTION + 0.03);
    expect(shouldDoubleRoute('item-7')).toBe(shouldDoubleRoute('item-7'));
  });
});
