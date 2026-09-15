import { describe, it, expect } from 'vitest';
import { compileOntology } from '@camefa/engine-ontology';
import { entityTypeKey, capabilityKey, isOk } from '@camefa/engine-kernel';
import { coreUnitsPack } from '@camefa/ontology-core-units';
import { photographyCorePack } from '../src/index.js';

const compiled = () => compileOntology([coreUnitsPack, photographyCorePack]);

describe('photography.core', () => {
  it('compiles cleanly', () => {
    const r = compiled();
    if (!r.ok) throw new Error(JSON.stringify(r.error, null, 2));
    expect(r.ok).toBe(true);
  });

  it('is fingerprint-stable across compilations', () => {
    const a = compiled();
    const b = compiled();
    expect(isOk(a) && isOk(b) && a.value.fingerprint === b.value.fingerprint).toBe(true);
  });

  it('inherits gear attributes onto camera bodies', () => {
    const r = compiled();
    if (!r.ok) throw new Error('compile failed');
    const keys = r.value.attributesFor(entityTypeKey('gear.capture.body')).map((x) => x.key);
    expect(keys).toContain('mass.operating');
    expect(keys).toContain('sensor.readout_time');
    expect(keys).not.toContain('media.write_throughput');
  });

  it('exposes every wedding profile capability on camera bodies', () => {
    const r = compiled();
    if (!r.ok) throw new Error('compile failed');
    const profile = r.value.activities.get('photo.wedding' as never)!;
    const bodyCaps = new Set(
      r.value.capabilitiesFor(entityTypeKey('gear.capture.body')).map((x) => x.key),
    );
    for (const req of [...profile.gates, ...profile.implies]) {
      expect(bodyCaps.has(req.capability)).toBe(true);
    }
  });

  it('orders derivation topology with no capability depending on a later one', () => {
    const r = compiled();
    if (!r.ok) throw new Error('compile failed');
    const position = new Map(r.value.topology.map((k, i) => [k, i]));
    for (const [key, def] of r.value.capabilities) {
      for (const input of def.inputs) {
        const dep = position.get(input as never);
        if (dep !== undefined) expect(dep).toBeLessThan(position.get(key)!);
      }
    }
  });

  it('keeps stops non-additive', () => {
    const r = compiled();
    if (!r.ok) throw new Error('compile failed');
    expect(r.value.units.get(capabilityKey('stop') as never)?.additive).toBe(false);
  });
});
