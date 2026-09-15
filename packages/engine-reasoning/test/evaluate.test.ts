import { describe, it, expect, beforeEach } from 'vitest';
import { capabilityKey } from '@camefa/engine-kernel';
import { compileOntology, type CompiledOntology } from '@camefa/engine-ontology';
import { coreUnitsPack } from '@camefa/ontology-core-units';
import { photographyCorePack, photographyDerivationRegistry, WEDDING } from '@camefa/ontology-photography-core';
import { FixtureClaimResolver, ALL_FIXTURES, FLAGSHIP_FF, SPARSE_APSC } from '@camefa/engine-testkit';
import { CapabilityRunner, MemoryCapabilityCache } from '@camefa/engine-capability';
import { Evaluator, expandActivity, rank, marginalGain } from '../src/index.js';

let ontology: CompiledOntology;
let evaluator: Evaluator;
const wedding = () => expandActivity(WEDDING);

beforeEach(() => {
  const compiled = compileOntology([coreUnitsPack, photographyCorePack]);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error, null, 2));
  ontology = compiled.value;
  const runner = new CapabilityRunner(
    ontology, photographyDerivationRegistry(),
    new FixtureClaimResolver(ALL_FIXTURES), new MemoryCapabilityCache(),
  );
  evaluator = new Evaluator(ontology, runner);
});

describe('Evaluator', () => {
  it('admits the flagship and scores it well for wedding work', async () => {
    const e = await evaluator.evaluate(FLAGSHIP_FF.id, FLAGSHIP_FF.entityType, wedding());
    expect(e.admitted).toBe(true);
    expect(e.score.point).toBeGreaterThan(0.6);
  });

  it('excludes the single-slot body on a blocking gate', async () => {
    const e = await evaluator.evaluate(SPARSE_APSC.id, SPARSE_APSC.entityType, wedding());
    expect(e.admitted).toBe(false);
    const slots = e.contributions.find((c) => c.capability === capabilityKey('redundancy.card_slots'));
    expect(slots?.verdict).toBe('violated');
  });

  it('marks partial verifiability rather than dropping unmeasurable requirements', async () => {
    const e = await evaluator.evaluate(SPARSE_APSC.id, SPARSE_APSC.entityType, wedding());
    expect(e.verifiability).toBe('partial');
    expect(e.unresolved.length).toBeGreaterThan(0);
  });

  it('widens the score interval when evidence is inferred', async () => {
    const ff = await evaluator.evaluate(FLAGSHIP_FF.id, FLAGSHIP_FF.entityType, wedding());
    const apsc = await evaluator.evaluate(SPARSE_APSC.id, SPARSE_APSC.entityType, wedding());
    const width = (x: typeof ff) => x.score.upper - x.score.lower;
    expect(width(apsc)).toBeGreaterThan(width(ff));
  });

  it('computes JND distance in the declared unit, not SI canonical', async () => {
    const e = await evaluator.evaluate(FLAGSHIP_FF.id, FLAGSHIP_FF.entityType, wedding());
    const lowlight = e.contributions.find((c) => c.capability === capabilityKey('lowlight.iso_headroom'));
    // 5.44 stops actual vs 4.0 stop gate, JND = 1/3 stop → ≈ 4.3 JND
    expect(lowlight?.deltaJnd).toBeCloseTo(4.3, 0);
  });

  it('reports binding requirements sorted by impact', async () => {
    const e = await evaluator.evaluate(SPARSE_APSC.id, SPARSE_APSC.entityType, wedding());
    expect(e.binding.length).toBeGreaterThan(0);
    const impacts = e.contributions.map((c) => Math.abs(c.impact));
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
  });

  it('penalises a weak link more than the arithmetic mean would', async () => {
    const parts = [{ satisfaction: 0.95, weight: 1 }, { satisfaction: 0.1, weight: 1 }];
    const { aggregate } = await import('../src/aggregate.js');
    expect(aggregate(parts, 0)).toBeLessThan(0.525);
    expect(aggregate(parts, -1)).toBeLessThan(aggregate(parts, 0));
  });

  it('groups overlapping candidates as tied rather than ordering them', async () => {
    const a = await evaluator.evaluate(FLAGSHIP_FF.id, FLAGSHIP_FF.entityType, wedding());
    const groups = rank([a, { ...a, target: 'clone' as never }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.tied).toHaveLength(2);
  });

  it('calls an unimproved swap lateral rather than worthwhile', async () => {
    const a = await evaluator.evaluate(FLAGSHIP_FF.id, FLAGSHIP_FF.entityType, wedding());
    expect(marginalGain(a, a).verdict).toBe('lateral');
    expect(marginalGain(a, a).significant).toBe(false);
  });
});
