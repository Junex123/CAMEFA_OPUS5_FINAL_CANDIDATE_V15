import { describe, it, expect, beforeEach } from 'vitest';
import { compileOntology, type CompiledOntology } from '@camefa/engine-ontology';
import { coreUnitsPack } from '@camefa/ontology-core-units';
import { photographyCorePack, photographyDerivationRegistry } from '@camefa/ontology-photography-core';
import {
  FixtureClaimResolver, ALL_FIXTURES, FLAGSHIP_FF, SPARSE_APSC, RuleBasedInterpreter,
} from '@camefa/engine-testkit';
import { CapabilityRunner, MemoryCapabilityCache } from '@camefa/engine-capability';
import { Interpreter, Evaluator, checkFeasibility, rank } from '../src/index.js';

let ontology: CompiledOntology;
let interpreter: Interpreter;
let evaluator: Evaluator;

const ctx = { locale: 'en', currency: 'EUR', ownedKit: [], profileVersion: '1' };
const say = (text: string) => [{ kind: 'utterance' as const, text, locale: 'en' }];
const candidates = [FLAGSHIP_FF, SPARSE_APSC].map((f) => ({ id: f.id, entityType: f.entityType }));

beforeEach(() => {
  const compiled = compileOntology([coreUnitsPack, photographyCorePack]);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error, null, 2));
  ontology = compiled.value;
  interpreter = new Interpreter(ontology, new RuleBasedInterpreter());
  evaluator = new Evaluator(
    ontology,
    new CapabilityRunner(
      ontology, photographyDerivationRegistry(),
      new FixtureClaimResolver(ALL_FIXTURES), new MemoryCapabilityCache(),
    ),
  );
});

describe('Interpreter', () => {
  it('expands an activity into gates and weighted requirements', async () => {
    const r = await interpreter.interpret(say('I shoot weddings'), ctx);
    expect(r.activities).toEqual(['photo.wedding']);
    expect(r.set.requirements.some((x) => x.hardness === 'blocking')).toBe(true);
  });

  it('discards a hallucinated capability instead of coercing it', async () => {
    const r = await interpreter.interpret(say('I shoot weddings and want to hallucinate'), ctx);
    expect(r.rejected.some((x) => x.reason === 'UNKNOWN_CAPABILITY')).toBe(true);
    expect(r.set.requirements.some((x) => x.capability.startsWith('telepathy'))).toBe(false);
  });

  it('lets a stated limit override the profile default without double-counting', async () => {
    const r = await interpreter.interpret(say('weddings, body under 700 g'), ctx);
    const mass = r.set.requirements.filter((x) => x.capability === 'handling.carry_mass' && x.op === 'lte');
    expect(mass).toHaveLength(1);
    expect(mass[0]!.origin.kind).toBe('stated');
    expect((mass[0]!.target as never as { value: { value: number } }).value.value).toBe(700);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  it('never downgrades a blocking gate through restatement', async () => {
    const r = await interpreter.interpret(say('weddings, body under 700 g'), ctx);
    const slots = r.set.requirements.find((x) => x.capability === 'redundancy.card_slots');
    expect(slots?.hardness).toBe('blocking');
  });

  it('scales profile weight by declared intensity', async () => {
    const regular = await interpreter.interpret([{ kind: 'activity', activity: 'photo.wedding' as never, intensity: 'regular' }], ctx);
    const occasional = await interpreter.interpret([{ kind: 'activity', activity: 'photo.wedding' as never, intensity: 'occasional' }], ctx);
    const w = (r: typeof regular) => r.set.requirements.find((x) => x.capability === 'tonal.dynamic_range')!.weight;
    expect(w(occasional)).toBeLessThan(w(regular));
  });

  it('derives an observed requirement from EXIF that outranks the profile', async () => {
    const r = await interpreter.interpret([
      ...say('weddings'),
      { kind: 'exif', summary: { frameCount: 4200, medianIso: 3200, p90Iso: 12800, fractionBelow125thSecond: 0.78, medianFocalLengthMm: 45 } },
    ], ctx);
    const lowlight = r.set.requirements.find((x) => x.capability === 'lowlight.iso_headroom' && x.op === 'gte');
    expect(lowlight?.origin.kind).toBe('observed');
    expect((lowlight!.target as never as { value: { value: number } }).value.value).toBeCloseTo(7, 0);
  });

  it('drops a corrected requirement', async () => {
    const first = await interpreter.interpret(say('weddings, body under 700 g'), ctx);
    const target = first.set.requirements.find((x) => x.origin.kind === 'stated')!;
    const second = await interpreter.interpret([
      ...say('weddings, body under 700 g'),
      { kind: 'correction', requirement: target.id, action: 'drop' },
    ], ctx);
    expect(second.set.requirements.find((x) => x.id === target.id)).toBeUndefined();
  });

  it('scores relative requirements against the candidate field', async () => {
    const r = await interpreter.interpret(say('weddings, lightest option'), ctx);
    const evals = await evaluator.evaluateMany(candidates, r.set);
    const relative = evals[0]!.contributions.find((c) => c.capability === 'handling.carry_mass');
    expect(relative).toBeDefined();
    expect(new Set(evals.map((e) => e.score.point)).size).toBeGreaterThan(1);
  });

  it('reports ranked relaxations when nothing is admissible', async () => {
    const r = await interpreter.interpret(say('weddings, body under 300 g'), ctx);
    const f = await checkFeasibility(evaluator, candidates, r.set);
    expect(f.kind).toBe('infeasible');
    if (f.kind === 'infeasible') {
      expect(f.relaxations[0]?.capability).toBe('handling.carry_mass');
      expect(f.relaxations[0]!.admits).toBeGreaterThan(0);
    }
  });

  it('runs the full loop from utterance to ranked groups', async () => {
    const r = await interpreter.interpret(say('I shoot weddings'), ctx);
    const evals = await evaluator.evaluateMany(candidates, r.set);
    const groups = rank(evals);
    expect(groups[0]!.tied[0]!.target).toBe(FLAGSHIP_FF.id);
    expect(evals.find((e) => e.target === SPARSE_APSC.id)!.admitted).toBe(false);
  });

  it('produces a stable cache key for identical signals', async () => {
    const a = await interpreter.interpret(say('weddings'), ctx);
    const b = await interpreter.interpret(say('weddings'), ctx);
    expect(a.cacheKey).toBe(b.cacheKey);
  });
});
