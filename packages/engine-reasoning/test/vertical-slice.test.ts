import { describe, it, expect, beforeAll } from 'vitest';
import { compileOntology } from '@camefa/engine-ontology';
import { runDerivations } from '@camefa/engine-capability';
import {
  interpretSignals, mergeRequirements, evaluateMany, rankCandidates,
  checkFeasibility, summarizeExif, exifSignals,
} from '../src/index.js';
import { buildSeedClaims, SEED_BODIES, SEED_ENTITY_COUNT } from '@camefa/photography-core/seed';
import { PROFILE_INDEX, profilesFingerprint } from '@camefa/photography-core/profiles';
import { fixtureResolver, syntheticExifHistory } from '@camefa/engine-testkit';

let ont: Awaited<ReturnType<typeof compileOntology>> extends infer R ? any : never;
let resolver: ReturnType<typeof fixtureResolver>;

beforeAll(async () => {
  const compiled = compileOntology(['core.units', 'photography.core']);
  expect(compiled.ok).toBe(true);
  ont = (compiled as any).value;
  resolver = fixtureResolver(buildSeedClaims());
});

describe('seed graph', () => {
  it('loads 31 entities with idempotent, content-addressed claims', () => {
    expect(SEED_ENTITY_COUNT).toBe(31);
    const a = buildSeedClaims();
    const b = buildSeedClaims();
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
  });
});

describe('exif → observed signals', () => {
  it('refuses to summarize a thin sample rather than emitting a weak signal', () => {
    const r = summarizeExif(syntheticExifHistory({ frames: 120, style: 'wedding' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INSUFFICIENT_SAMPLE');
  });

  it('recovers a low-light working pattern from a reception history', () => {
    const s = summarizeExif(syntheticExifHistory({ frames: 3200, style: 'wedding', seed: 7 }));
    expect(s.ok).toBe(true);
    if (!s.ok) return;

    expect(s.value.isoStopsP90!.value).toBeGreaterThan(5);
    expect(s.value.lightLimitedFraction!.value).toBeGreaterThan(0.25);
    expect(s.value.distinctBodies).toBe(2);

    const sigs = exifSignals(s.value, ont);
    const iso = sigs.find((x) => x.capabilityKey === 'lowlight.iso_headroom');
    expect(iso?.proposal).toMatchObject({ type: 'threshold', comparator: 'gte' });
    expect(iso!.confidence).toBeGreaterThan(0.8);
    // EXIF proposes floors only; no signal should ever cap a capability.
    expect(sigs.every((x) => x.proposal.type !== 'threshold' || x.proposal.comparator === 'gte')).toBe(true);
  });

  it('emits reach demand for a wildlife history and none for wedding', () => {
    const wild = summarizeExif(syntheticExifHistory({ frames: 4000, style: 'wildlife', seed: 3 }));
    const wed = summarizeExif(syntheticExifHistory({ frames: 3200, style: 'wedding', seed: 3 }));
    expect(wild.ok && wed.ok).toBe(true);
    if (!wild.ok || !wed.ok) return;

    expect(wild.value.reachMmP90!.value).toBeGreaterThan(400);
    expect(wed.value.reachMmP90!.value).toBeLessThan(200);
    expect(exifSignals(wild.value, ont).some((s) => s.capabilityKey === 'capture.burst_depth')).toBe(true);
  });
});

describe('utterance → ranked decision', () => {
  const candidates = SEED_BODIES.map((b) => b.key as any);

  it('ranks wedding candidates and gates on dual card slots', async () => {
    const interpreted = interpretSignals({
      utterance: 'I shoot weddings, mostly available light receptions, budget around $4000',
      profile: PROFILE_INDEX.get('activity.wedding.documentary')!,
      ontology: ont,
    });
    expect(interpreted.ok).toBe(true);
    if (!interpreted.ok) return;

    const requirements = mergeRequirements(interpreted.value.signals);
    const derived = await runDerivations({
      entityIds: candidates,
      capabilities: requirements.map((r) => r.capabilityKey),
      ontology: ont,
      resolver,
      asOf: '2026-02-01T00:00:00.000Z',
    });
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;

    const evaluations = evaluateMany(derived.value.capabilities, requirements, ont);
    const ranked = rankCandidates(evaluations);

    // Single-slot bodies violate a hard requirement and cannot rank.
    const singleSlot = SEED_BODIES.filter((b) => b.cardSlots < 2).map((b) => b.key);
    for (const key of singleSlot) {
      const row = ranked.find((r) => r.entityId === key)!;
      expect(row.verdict).toBe('violated');
      expect(row.gateFailures).toContain('redundancy.card_slots');
    }

    // The flagship and the pro body should both clear; ordering between them
    // depends on the DR/readout trade, so assert the set, not the order.
    const topTwo = ranked.filter((r) => r.verdict === 'satisfied').slice(0, 2).map((r) => r.entityId);
    expect(topTwo).toEqual(expect.arrayContaining(['body.ax_flagship', 'body.bz_flagship']));

    expect(checkFeasibility(evaluations, requirements).feasible).toBe(true);
  });

  it('is deterministic across repeated runs', async () => {
    const run = async () => {
      const i = interpretSignals({
        utterance: 'birds in flight, mostly dawn, handheld',
        profile: PROFILE_INDEX.get('activity.wildlife.birds')!,
        ontology: ont,
      });
      if (!i.ok) throw new Error('interpret failed');
      const reqs = mergeRequirements(i.value.signals);
      const d = await runDerivations({
        entityIds: candidates, capabilities: reqs.map((r) => r.capabilityKey),
        ontology: ont, resolver, asOf: '2026-02-01T00:00:00.000Z',
      });
      if (!d.ok) throw new Error('derive failed');
      return JSON.stringify(rankCandidates(evaluateMany(d.value.capabilities, reqs, ont)));
    };
    expect(await run()).toBe(await run());
  });

  it('lets stated requirements override the profile without double-counting', () => {
    const i = interpretSignals({
      utterance: 'weddings, but weight is my absolute priority, I have a back injury',
      profile: PROFILE_INDEX.get('activity.wedding.documentary')!,
      ontology: ont,
    });
    expect(i.ok).toBe(true);
    if (!i.ok) return;

    const merged = mergeRequirements(i.value.signals);
    const mass = merged.filter((r) => r.capabilityKey === 'handling.carry_mass');
    expect(mass).toHaveLength(1);              // profile's 'moderate' is replaced, not added
    expect(mass[0]!.emphasis).toBe('critical');
    expect(mass[0]!.provenance).toBe('stated');
  });

  it('surfaces unknown capabilities as indeterminate rather than dropping candidates', async () => {
    const thin = fixtureResolver(
      buildSeedClaims().filter((c) => !(c.entityId === 'body.ax_pro' && c.attributeKey === 'af.rated_low_light_ev')),
    );
    const reqs = mergeRequirements(
      (interpretSignals({
        utterance: 'weddings',
        profile: PROFILE_INDEX.get('activity.wedding.documentary')!,
        ontology: ont,
      }) as any).value.signals,
    );
    const d = await runDerivations({
      entityIds: ['body.ax_pro' as any], capabilities: reqs.map((r) => r.capabilityKey),
      ontology: ont, resolver: thin, asOf: '2026-02-01T00:00:00.000Z',
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;

    const evaluated = evaluateMany(d.value.capabilities, reqs, ont)[0]!;
    expect(evaluated.perRequirement.find((r) => r.capabilityKey === 'af.lowlight_reliability')!.verdict)
      .toBe('indeterminate');
    expect(evaluated.verdict).not.toBe('violated');
    expect(evaluated.coverage.unknownCount).toBe(1);
  });
});

describe('profiles', () => {
  it('every requirement cites a capability the ontology defines', () => {
    for (const profile of PROFILE_INDEX.values()) {
      for (const r of profile.requirements) {
        expect(ont.capabilities.has(r.capabilityKey), `${profile.id} → ${r.capabilityKey}`).toBe(true);
      }
    }
  });

  it('every requirement carries a rationale, since explanations may not invent one', () => {
    for (const profile of PROFILE_INDEX.values()) {
      for (const r of profile.requirements) {
        expect(r.rationale.length).toBeGreaterThan(40);
      }
    }
  });

  it('fingerprints stably', () => {
    expect(profilesFingerprint()).toBe(profilesFingerprint());
  });
});
