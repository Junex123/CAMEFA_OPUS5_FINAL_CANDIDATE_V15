import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/create-engine.js';
import { coreUnitsPack } from '@camefa/ontology-core-units';
import { photographyCorePack, photographyDerivationRegistry } from '@camefa/ontology-photography-core';
import type { AttributeKey, EntityId } from '@camefa/engine-kernel';
import type { ClaimResolverPort, ResolvedClaim, ClaimValue } from '@camefa/engine-capability';

class FixtureClaims implements ClaimResolverPort {
  private readonly values = new Map<string, Map<AttributeKey, ClaimValue>>([
    ['body.a', new Map([
      ['sensor.width', qty(36, 'mm')], ['sensor.height', qty(24, 'mm')], ['sensor.effective_pixels', qty(33, 'MP')],
      ['sensor.read_noise_high_gain', qty(1.5, 'count')], ['sensor.base_iso', qty(100, 'count')], ['generation_year', qty(2025, 'count')],
      ['sensor.dr_measured', qty(14.2, 'stop')], ['sensor.readout_time', qty(4, 'ms')], ['sensor.stacked', bool(true)],
      ['af.low_light_limit', qty(-5, 'EV')], ['af.subject_detection', bool(true)], ['mass.operating', qty(700, 'g')], ['media.slot_count', qty(2, 'count')],
      ['power.cipa_rating', qty(1800, 'count')], ['power.capacity', qty(20, 'Wh')], ['weather.sealing', en('professional')],
    ])],
    ['body.b', new Map([
      ['sensor.width', qty(36, 'mm')], ['sensor.height', qty(24, 'mm')], ['sensor.effective_pixels', qty(24, 'MP')],
      ['sensor.read_noise_high_gain', qty(3, 'count')], ['sensor.base_iso', qty(100, 'count')], ['generation_year', qty(2020, 'count')],
      ['sensor.dr_measured', qty(12, 'stop')], ['sensor.readout_time', qty(28, 'ms')], ['sensor.stacked', bool(false)],
      ['af.low_light_limit', qty(-3, 'EV')], ['af.subject_detection', bool(false)], ['mass.operating', qty(760, 'g')], ['media.slot_count', qty(1, 'count')],
      ['power.cipa_rating', qty(1000, 'count')], ['power.capacity', qty(15, 'Wh')], ['weather.sealing', en('moderate')],
    ])],
  ]);
  async resolve(subject: EntityId, attributes: readonly AttributeKey[], _opts: { readonly validAt?: string; readonly knownAt?: string; readonly policy?: string }): Promise<ReadonlyMap<AttributeKey, ResolvedClaim>> {
    const values = this.values.get(String(subject)) ?? new Map();
    const out = new Map<AttributeKey, ResolvedClaim>();
    for (const attribute of attributes) {
      const value = values.get(attribute);
      if (!value) continue;
      out.set(attribute, { attribute, value, confidence: 0.99, evidenceClass: 'manufacturer', contributing: [`claim:${subject}:${attribute}`], dissenting: [] });
    }
    return out;
  }
}
const qty = (value: number, unit: string): ClaimValue => ({ kind: 'quantity', value: { value, unit: unit as never } });
const bool = (value: boolean): ClaimValue => ({ kind: 'boolean', value });
const en = (value: string): ClaimValue => ({ kind: 'enum', value });

describe('createEngine', () => {
  it('assembles the canonical ontology → capability → reasoning path', async () => {
    const engine = createEngine({ ontologySource: [coreUnitsPack, photographyCorePack], derivations: photographyDerivationRegistry(), claims: new FixtureClaims(), budget: { evidenceReads: 1000, derivations: 1000, scoringPasses: 1000, wallClockMs: 5000, fragility: { evidenceReads: 100, derivations: 100, scoringPasses: 100, wallClockMs: 500 } }, now: () => '2026-01-01T00:00:00.000Z', buildFingerprint: 'test-build', defaultEntityType: 'gear.capture.body' });
    const receipt = await engine.evaluate({ profile: 'camera.comparison', candidates: ['body.a', 'body.b'], constraints: [{ attribute: 'redundancy.card_slots', op: 'gte', value: 2 }], weights: [{ attribute: 'lowlight.iso_headroom', weight: 1 }, { attribute: 'tonal.dynamic_range', weight: 1 }], locale: 'en' });
    expect(receipt.schema).toBe('camefa.receipt/1');
    expect(receipt.receiptId).toHaveLength(64);
    expect(receipt.decision.eliminated.map((x) => x.slot)).toContain('body.b');
    expect(receipt.decision.winner).toBe('body.a');
    expect(engine.versions.ontology).toBeTruthy();
  });
});
