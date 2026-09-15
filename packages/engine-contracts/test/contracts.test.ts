import { describe, it, expect } from 'vitest';
import { EngineClient, issueReceipt, verifyReceipt, CostMeter, DEFAULT_BUDGETS, receiptSlug } from '../src/index.js';
import { makeTestPorts, FIXTURE_CONTEXT, FLAGSHIP_A, FLAGSHIP_B, APSC_A } from '@camefa/engine-testkit';

describe('CostMeter', () => {
  it('enforces per-dimension caps before the scalar ceiling', () => {
    const m = new CostMeter({ maxWorkUnits: 1_000_000, caps: { narrativeCalls: 1 } });
    expect(m.charge({ narrativeCalls: 1 }).ok).toBe(true);
    const r = m.charge({ narrativeCalls: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('BUDGET_EXCEEDED');
  });

  it('does not mutate spend on a rejected charge', () => {
    const m = new CostMeter({ maxWorkUnits: 10 });
    m.charge({ claimReads: 5 });
    m.charge({ claimReads: 100 });
    expect(m.spent.claimReads).toBe(5);
  });
});

describe('receipts', () => {
  it('is content-addressed and stable across wall-clock drift', async () => {
    const ports = makeTestPorts();
    const client = new EngineClient(ports);
    const req = {
      primitive: 'evaluate' as const,
      input: { candidates: [FLAGSHIP_A, FLAGSHIP_B, APSC_A], requirements: [] },
      context: FIXTURE_CONTEXT,
    };

    const a = await client.evaluate(req);
    const b = await client.evaluate({
      ...req,
      context: { ...FIXTURE_CONTEXT, requestId: 'req-2', now: '2026-01-01T00:00:05.000Z', asOf: FIXTURE_CONTEXT.asOf },
    });

    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.meta.receiptId).toBe(b.value.meta.receiptId);
  });

  it('changes receiptId when the ontology fingerprint changes', async () => {
    const base = await new EngineClient(makeTestPorts()).evaluate({
      primitive: 'evaluate', input: { candidates: [FLAGSHIP_A], requirements: [] }, context: FIXTURE_CONTEXT,
    });
    const bumped = await new EngineClient(makeTestPorts({ ontologyVersion: '0.2.0' })).evaluate({
      primitive: 'evaluate', input: { candidates: [FLAGSHIP_A], requirements: [] }, context: FIXTURE_CONTEXT,
    });
    expect(base.ok && bumped.ok).toBe(true);
    if (base.ok && bumped.ok) expect(base.value.meta.receiptId).not.toBe(bumped.value.meta.receiptId);
  });

  it('verifies a deterministic replay and detects divergence', () => {
    const r = issueReceipt({
      primitive: 'evaluate', context: FIXTURE_CONTEXT, input: { a: 1 },
      output: { ranking: ['x'] }, lineage: null,
      engine: { build: { kernel: '0.1.0', contracts: '0.1.0', commit: 'test' }, ontology: [], derivation: [], model: null },
      cost: { claimReads: 1, derivations: 0, candidates: 1, solverNodes: 0, narrativeCalls: 0, modelTokens: 0 },
      determinism: 'deterministic', warnings: [],
    });
    expect(verifyReceipt(r, { ranking: ['x'] }).ok).toBe(true);
    expect(verifyReceipt(r, { ranking: ['y'] }).ok).toBe(false);
    expect(receiptSlug(r)).toMatch(/^evaluate-[0-9a-f]{16}$/);
  });
});

describe('admission control', () => {
  it('refuses an oversized solve before doing work', async () => {
    const ports = makeTestPorts();
    const res = await new EngineClient(ports).solve({
      primitive: 'solve',
      input: { kitEntityIds: [FLAGSHIP_A], budgetMinor: 500_000, maxConfigurations: 10_000 },
      context: { ...FIXTURE_CONTEXT, actor: { kind: 'anonymous', id: 'anon-1' } },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(['RATE_LIMITED', 'BUDGET_EXCEEDED']).toContain(res.error.code);
    expect(ports.spy.derivationCalls).toBe(0);
  });

  it('never emits prose when allowModel is false', async () => {
    const ports = makeTestPorts();
    const seed = await new EngineClient(ports).evaluate({
      primitive: 'evaluate', input: { candidates: [FLAGSHIP_A, FLAGSHIP_B], requirements: [] }, context: FIXTURE_CONTEXT,
    });
    expect(seed.ok).toBe(true);
    if (!seed.ok) return;

    const ex = await new EngineClient(ports).explain({
      primitive: 'explain',
      input: { decisionId: seed.value.meta.receiptId },
      context: { ...FIXTURE_CONTEXT, allowModel: false },
    });
    expect(ex.ok).toBe(true);
    if (ex.ok) {
      expect(ex.value.meta.deterministic).toBe(true);
      expect(ports.spy.articulatorCalls).toBe(0);
    }
  });
});
