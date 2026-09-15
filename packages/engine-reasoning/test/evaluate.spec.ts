import { describe, expect, it } from 'vitest';
import { CostMeter } from '@camefa/engine-kernel';
import { sealReceipt, verifyReceipt } from '@camefa/engine-contracts';
import { compileOntology, type OntologyPackSource } from '@camefa/engine-ontology';
import { evaluate, EvaluationError, type ClaimRow } from '../src/evaluate.js';

const pack: OntologyPackSource = {
  packId: 'camera.core',
  version: '1.0.0',
  derivationPacks: [],
  attributes: [
    {
      attributeId: 'price_usd',
      type: 'numeric',
      unit: 'usd',
      direction: 'lower_better',
      jnd: 10,
      plausible: { min: 100, max: 100000 },
      label: 'Price',
      derived: false,
    },
    {
      attributeId: 'weight_g',
      type: 'numeric',
      unit: 'g',
      direction: 'lower_better',
      jnd: 5,
      plausible: { min: 100, max: 5000 },
      label: 'Weight',
      derived: false,
    },
    {
      attributeId: 'low_light_stops',
      type: 'numeric',
      unit: 'stops',
      direction: 'higher_better',
      jnd: 0.1,
      plausible: { min: 0, max: 20 },
      label: 'Low light',
      derived: false,
    },
  ],
  requirements: [
    {
      requirementId: 'req:budget',
      attributeId: 'price_usd',
      hard: true,
      curve: [
        { at: 4000, satisfaction: 1 },
        { at: 4001, satisfaction: 0 },
      ],
      rationale: 'Stated hard ceiling.',
    },
    {
      requirementId: 'req:portable',
      attributeId: 'weight_g',
      hard: false,
      curve: [
        { at: 500, satisfaction: 1 },
        { at: 1200, satisfaction: 0.05 },
      ],
      rationale: 'All-day handheld work is limited by carried mass.',
    },
    {
      requirementId: 'req:lowlight',
      attributeId: 'low_light_stops',
      hard: false,
      curve: [
        { at: 8, satisfaction: 0.05 },
        { at: 14, satisfaction: 1 },
      ],
      rationale: 'Receptions are dim and flash is often unwelcome.',
    },
  ],
  profiles: [
    {
      profileId: 'wedding.documentary',
      label: 'Wedding, documentary',
      appliesTo: ['camera_body'],
      requirements: [
        { requirementId: 'req:budget', emphasis: 'critical', rationale: 'Budget is fixed.' },
        { requirementId: 'req:lowlight', emphasis: 'critical', rationale: 'Dim venues dominate.' },
        { requirementId: 'req:portable', emphasis: 'important', rationale: 'Ten-hour days.' },
      ],
    },
  ],
};

const ontology = compileOntology([pack], 'mdl:test');

const engine = {
  ontologyFingerprint: ontology.ontologyFingerprint,
  modelRef: 'mdl:test',
  calibrationRef: 'cal:1',
  reliabilityFingerprint: 'rel:1',
  corpusEpoch: 'ep:test',
  engineVersion: '0.0.0',
};

let claimSeq = 0;
const claim = (
  entityId: string,
  attribute: string,
  value: number,
  over: Partial<ClaimRow> = {},
): ClaimRow => ({
  claimId: `c:${(claimSeq += 1)}`,
  entityId,
  entityLabel: entityId.toUpperCase(),
  entityType: 'camera_body',
  attribute,
  value,
  unit: ontology.attributes.get(attribute)!.unit,
  sourceId: 'src:mfr',
  reliability: 0.9,
  conflictId: null,
  outlierFlags: [],
  ...over,
});

const run = (claims: ClaimRow[], sink = new CostMeter()) =>
  evaluate(
    {
      activityProfile: 'wedding.documentary',
      constraints: { budgetUsd: 4000 },
      label: 'wedding.documentary under $4000',
      claims,
      derived: [],
      claimSetHash: 'h1:claims',
      engine,
      quarantinedSlotCount: 0,
      replacesReceiptId: null,
    },
    ontology,
    sink,
  );

const full = (entityId: string, price: number, weight: number, stops: number) => [
  claim(entityId, 'price_usd', price),
  claim(entityId, 'weight_g', weight),
  claim(entityId, 'low_light_stops', stops),
];

describe('evaluate', () => {
  it('ranks candidates and seals into a verifiable receipt', () => {
    const out = run([...full('e:a', 3200, 680, 13), ...full('e:b', 3900, 900, 10)]);
    const receipt = sealReceipt({
      ...out.draft,
      sensitivity: null,
      leverage: [],
      sealedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(out.draft.outcome.ranked[0].entityId).toBe('e:a');
    expect(verifyReceipt(receipt)).toMatchObject({ addressMatches: true, replayable: true });
  });

  it('eliminates on a hard requirement and names the binding constraint', () => {
    const out = run([...full('e:a', 3200, 680, 13), ...full('e:b', 4600, 600, 14)]);
    const b = out.draft.outcome.ranked.find((r) => r.entityId === 'e:b')!;
    expect(b.eliminated).toBe(true);
    expect(b.binding).toMatchObject({ requirement: 'req:budget' });
    expect(b.binding!.margin).toBeCloseTo(-599, 6);
  });

  it('sorts eliminated candidates last regardless of score', () => {
    const out = run([...full('e:a', 3900, 1100, 9), ...full('e:b', 9000, 500, 14)]);
    expect(out.draft.outcome.ranked.map((r) => r.eliminated)).toEqual([false, true]);
  });

  it('excludes a candidate with no evidence for the hard requirement rather than ranking it', () => {
    const out = run([
      ...full('e:a', 3200, 680, 13),
      claim('e:b', 'weight_g', 500),
      claim('e:b', 'low_light_stops', 15),
    ]);
    expect(out.draft.outcome.excluded).toEqual([
      { entityId: 'e:b', reason: 'no evidence for hard requirement attribute(s): price_usd' },
    ]);
    expect(out.draft.outcome.ranked.map((r) => r.entityId)).toEqual(['e:a']);
  });

  it('does not let a missing soft attribute become an advantage', () => {
    const withGap = run([
      ...full('e:a', 3200, 680, 13),
      claim('e:b', 'price_usd', 3000),
      claim('e:b', 'low_light_stops', 14),
    ]);
    const a = withGap.draft.outcome.ranked.find((r) => r.entityId === 'e:a');
    const b = withGap.draft.outcome.ranked.find((r) => r.entityId === 'e:b');
    // e:b hid its weight; imputation gives it the worst observed weight, so it
    // cannot outrank a fully-documented candidate on the strength of a gap.
    expect(b!.score).toBeLessThanOrEqual(a!.score);
    expect(b!.confidence).toBeLessThan(a!.confidence);
  });

  it('is deterministic and order-independent over claims', () => {
    const claims = [...full('e:a', 3200, 680, 13), ...full('e:b', 3900, 900, 10)];
    const forward = run(claims);
    const reversed = run([...claims].reverse());
    expect(forward.draft.outcome).toEqual(reversed.draft.outcome);
  });

  it('breaks exact score ties on entityId so replays agree', () => {
    const out = run([...full('e:z', 3000, 700, 12), ...full('e:a', 3000, 700, 12)]);
    expect(out.draft.outcome.ranked.map((r) => r.entityId)).toEqual(['e:a', 'e:z']);
  });

  it('carries conflict ids into the trace and the contested slot count', () => {
    const out = run([
      claim('e:a', 'price_usd', 3200),
      claim('e:a', 'weight_g', 680, { conflictId: 'slot:e:a|weight_g|2026-Q1' }),
      claim('e:a', 'low_light_stops', 13),
    ]);
    expect(out.draft.inputs.contestedSlotCount).toBe(1);
    expect(out.trace.contestedSlots[0].conflictId).toBe('slot:e:a|weight_g|2026-Q1');
  });

  it('raises confidence when independent sources corroborate a slot', () => {
    const single = run(full('e:a', 3200, 680, 13));
    const corroborated = run([
      ...full('e:a', 3200, 680, 13),
      claim('e:a', 'weight_g', 680, { sourceId: 'src:lab' }),
      claim('e:a', 'low_light_stops', 13, { sourceId: 'src:lab' }),
      claim('e:a', 'price_usd', 3200, { sourceId: 'src:lab' }),
    ]);
    expect(corroborated.draft.outcome.ranked[0].confidence).toBeGreaterThan(
      single.draft.outcome.ranked[0].confidence,
    );
  });

  it('emits a lineage tree rooted on the aggregation rule', () => {
    const out = run(full('e:a', 3200, 680, 13));
    expect(out.lineage.label).toContain('p = -0.5');
    const terms = out.lineage.children[0].children.map((c) => c.nodeId);
    expect(terms).toContain('term:req:lowlight');
  });

  it('meters claim reads and solver nodes', () => {
    const meter = new CostMeter();
    run([...full('e:a', 3200, 680, 13), ...full('e:b', 3900, 900, 10)], meter);
    expect(meter.spent('claimReads')).toBe(6);
    expect(meter.spent('solverNodes')).toBe(4);
  });

  it('refuses an unknown activity profile', () => {
    expect(() =>
      evaluate(
        {
          activityProfile: 'nonexistent',
          constraints: {},
          label: 'x',
          claims: [],
          derived: [],
          claimSetHash: 'h',
          engine,
          quarantinedSlotCount: 0,
          replacesReceiptId: null,
        },
        ontology,
        new CostMeter(),
      ),
    ).toThrow(EvaluationError);
  });

  it('produces an empty ranking rather than throwing when nothing is admissible', () => {
    const out = run([]);
    expect(out.draft.outcome.ranked).toEqual([]);
    expect(out.lineage.children).toEqual([]);
  });
});
