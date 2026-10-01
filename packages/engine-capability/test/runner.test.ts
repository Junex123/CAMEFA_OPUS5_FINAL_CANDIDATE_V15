import { describe, it, expect, beforeEach } from 'vitest';
import { capabilityKey, unitKey, isOk } from '@camefa/engine-kernel';
import { compileOntology, type CompiledOntology } from '@camefa/engine-ontology';
import { coreUnitsPack } from '../../../ontology-packs/core.units/src/index.js';
import { photographyCorePack, photographyDerivationRegistry } from '../../../ontology-packs/photography.core/src/index.js';
import { FixtureClaimResolver, ALL_FIXTURES, FLAGSHIP_FF, SPARSE_APSC, CFEXPRESS_CARD } from '@camefa/engine-testkit';
import { CapabilityRunner, MemoryCapabilityCache } from '../src/index.js';

const c = capabilityKey;

let ontology: CompiledOntology;
let resolver: FixtureClaimResolver;
let cache: MemoryCapabilityCache;
let runner: CapabilityRunner;

beforeEach(() => {
  const compiled = compileOntology([coreUnitsPack, photographyCorePack]);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.error, null, 2));
  ontology = compiled.value;
  resolver = new FixtureClaimResolver(ALL_FIXTURES);
  cache = new MemoryCapabilityCache();
  runner = new CapabilityRunner(ontology, photographyDerivationRegistry(), resolver, cache);
});

const derive = (e: { id: never; entityType: string }, keys: readonly ReturnType<typeof c>[]) =>
  runner.derive(e.id, e.entityType, keys);

describe('CapabilityRunner', () => {
  it('derives low-light headroom from measured read noise via the primary strategy', async () => {
    const out = await derive(FLAGSHIP_FF as never, [c('lowlight.iso_headroom')]);
    const v = out.get(c('lowlight.iso_headroom'))!;
    expect(v.result.kind).toBe('value');
    expect(v.evidenceClass).toBe('measured');
    expect(v.lineage.kind === 'derivation' && v.lineage.strategy).toBe('primary');
    // 864mm² reference, 1.1e- noise → 5.0 - 0.005 + log2(1.5/1.1) ≈ 5.44 stops
    const value = (v.result as { value: { value: number; unit: string } }).value;
    expect(value.unit).toBe('stop');
    expect(value.value).toBeCloseTo(5.44, 1);
  });

  it('falls back to geometry when read noise is absent and marks the result inferred', async () => {
    const out = await derive(SPARSE_APSC as never, [c('lowlight.iso_headroom')]);
    const v = out.get(c('lowlight.iso_headroom'))!;
    expect(v.lineage.kind === 'derivation' && v.lineage.strategy).toBe('fallback');
    expect(v.evidenceClass).toBe('inferred');
    expect(v.confidence).toBeLessThan(0.75);
  });

  it('ranks the full-frame body above the APS-C body on low-light headroom', async () => {
    const ff = await derive(FLAGSHIP_FF as never, [c('lowlight.iso_headroom')]);
    const apsc = await derive(SPARSE_APSC as never, [c('lowlight.iso_headroom')]);
    const a = (ff.get(c('lowlight.iso_headroom'))!.result as never as { value: { value: number } }).value.value;
    const b = (apsc.get(c('lowlight.iso_headroom'))!.result as never as { value: { value: number } }).value.value;
    expect(a).toBeGreaterThan(b);
  });

  it('returns unknown rather than zero when no strategy is satisfiable', async () => {
    const out = await derive(SPARSE_APSC as never, [c('video.codec_load')]);
    const v = out.get(c('video.codec_load'))!;
    expect(v.result.kind).toBe('unknown');
    expect(v.confidence).toBe(0);
  });

  it('gates capabilities by entity type', async () => {
    const out = await derive(CFEXPRESS_CARD as never, [c('redundancy.card_slots')]);
    const v = out.get(c('redundancy.card_slots'))!;
    expect(v.result.kind === 'unknown' && v.result.reason.code).toBe('NOT_APPLICABLE');
  });

  it('applies codec load multipliers for depth and chroma', async () => {
    const out = await derive(FLAGSHIP_FF as never, [c('video.codec_load')]);
    const value = (out.get(c('video.codec_load'))!.result as never as { value: { value: number } }).value.value;
    expect(value).toBe(Math.round(600 * 1.35 * 1.4)); // 1134 Mbps
  });

  it('emits ordinal capabilities without quantity conversion', async () => {
    const out = await derive(FLAGSHIP_FF as never, [c('resilience.weather')]);
    const v = out.get(c('resilience.weather'))!;
    expect(v.result).toEqual({ kind: 'value', value: { ordinal: 'professional' } });
  });

  it('caches on repeat derivation without re-running the resolver strategy', async () => {
    await derive(FLAGSHIP_FF as never, [c('handling.carry_mass')]);
    const before = cache.stats();
    await derive(FLAGSHIP_FF as never, [c('handling.carry_mass')]);
    expect(cache.stats().hits).toBeGreaterThan(before.hits);
  });

  it('produces a cache key that changes when a contributing claim changes', async () => {
    const first = await derive(FLAGSHIP_FF as never, [c('handling.carry_mass')]);
    const mutated = new FixtureClaimResolver([
      { ...FLAGSHIP_FF, claims: { ...FLAGSHIP_FF.claims, 'mass.operating': { ...FLAGSHIP_FF.claims['mass.operating']!, claimId: 'revised-mass' } } },
    ]);
    const second = new CapabilityRunner(ontology, photographyDerivationRegistry(), mutated, new MemoryCapabilityCache());
    const out = await second.derive(FLAGSHIP_FF.id, FLAGSHIP_FF.entityType, [c('handling.carry_mass')]);
    expect(out.get(c('handling.carry_mass'))!.cacheKey)
      .not.toBe(first.get(c('handling.carry_mass'))!.cacheKey);
  });

  it('carries claim provenance through to lineage leaves', async () => {
    const out = await derive(FLAGSHIP_FF as never, [c('tonal.dynamic_range')]);
    const lineage = out.get(c('tonal.dynamic_range'))!.lineage;
    expect(lineage.kind).toBe('derivation');
    expect(lineage.kind === 'derivation' && lineage.inputs[0]?.kind).toBe('claim');
  });
});
