import { describe, it, expect } from 'vitest';
import {
  linearUnit, logUnit, D, unitKey, q, capabilityKey, attributeKey,
  entityTypeKey, derivationId, packId, isOk,
} from '@camefa/engine-kernel';
import { compileOntology } from '../src/compile.js';
import type { OntologyPack } from '../src/pack.js';
import type { SemVer } from '../src/definitions.js';

const v = (s: string) => s as SemVer;

const basePack = (over: Partial<OntologyPack> = {}): OntologyPack => ({
  id: packId('test.core'),
  version: v('1.0.0'),
  dependsOn: [],
  units: [linearUnit('g', 'gram', D.mass, 0.001), logUnit('stop', 'stop', D.dimensionless, 2)],
  entityTypes: [
    { key: entityTypeKey('gear'), label: 'Gear', abstract: true },
    { key: entityTypeKey('gear.body'), label: 'Body', extends: entityTypeKey('gear'), abstract: false },
  ],
  attributes: [{
    key: attributeKey('mass.operating'),
    label: 'Operating mass',
    valueType: { kind: 'quantity', dimension: D.mass, canonicalUnit: unitKey('g') },
    cardinality: 'single',
    temporality: 'static',
    appliesTo: [entityTypeKey('gear')],
  }],
  capabilities: [{
    key: capabilityKey('handling.portability'),
    label: 'Portability',
    output: { kind: 'quantity', dimension: D.mass, canonicalUnit: unitKey('g') },
    inputs: [attributeKey('mass.operating')],
    derivation: derivationId('portability@1'),
    version: v('1.0.0'),
    interpretation: 'lower_is_better',
    jnd: q(80, unitKey('g')),
    appliesTo: [entityTypeKey('gear.body')],
  }],
  activities: [],
  ...over,
});

describe('compileOntology', () => {
  it('compiles a valid pack and produces a stable fingerprint', () => {
    const a = compileOntology([basePack()]);
    const b = compileOntology([basePack()]);
    expect(a.ok && b.ok).toBe(true);
    expect(isOk(a) && isOk(b) && a.value.fingerprint === b.value.fingerprint).toBe(true);
  });

  it('inherits attributes through the entity type chain', () => {
    const r = compileOntology([basePack()]);
    expect(isOk(r) && r.value.attributesFor(entityTypeKey('gear.body')).length).toBe(1);
  });

  it('rejects a JND in the wrong dimension', () => {
    const p = basePack();
    const broken: OntologyPack = {
      ...p,
      capabilities: [{ ...p.capabilities[0]!, jnd: q(1, unitKey('stop')) }],
    };
    const r = compileOntology([broken]);
    expect(!r.ok && r.error.some((e) => e.code === 'JND_DIMENSION_MISMATCH')).toBe(true);
  });

  it('rejects unresolved capability inputs', () => {
    const p = basePack();
    const broken: OntologyPack = {
      ...p,
      capabilities: [{ ...p.capabilities[0]!, inputs: [attributeKey('does.not.exist')] }],
    };
    const r = compileOntology([broken]);
    expect(!r.ok && r.error.some((e) => e.code === 'UNKNOWN_INPUT')).toBe(true);
  });

  it('detects capability cycles', () => {
    const p = basePack();
    const a = { ...p.capabilities[0]!, key: capabilityKey('a'), inputs: [capabilityKey('b')] };
    const b = { ...p.capabilities[0]!, key: capabilityKey('b'), inputs: [capabilityKey('a')] };
    const r = compileOntology([{ ...p, capabilities: [a, b] }]);
    expect(!r.ok && r.error.some((e) => e.code === 'CAPABILITY_CYCLE')).toBe(true);
  });

  it('produces a deterministic topological order', () => {
    const p = basePack();
    const base = p.capabilities[0]!;
    const downstream = {
      ...base, key: capabilityKey('handling.carry_score'),
      inputs: [capabilityKey('handling.portability')],
    };
    const r = compileOntology([{ ...p, capabilities: [downstream, base] }]);
    expect(isOk(r) && r.value.topology).toEqual([
      capabilityKey('handling.portability'),
      capabilityKey('handling.carry_score'),
    ]);
  });
});
