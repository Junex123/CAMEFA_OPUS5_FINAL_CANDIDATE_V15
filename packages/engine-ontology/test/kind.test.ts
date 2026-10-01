import { describe, it, expect } from 'vitest';
import { unitKey, q, isOk } from '@camefa/engine-kernel';
import { compileOntology } from '../src/compile.js';
import { coreUnitsPack } from '../../../ontology-packs/core.units/src/index.js';
import { photographyCorePack } from '../../../ontology-packs/photography.core/src/index.js';

const compiled = () => compileOntology([coreUnitsPack, photographyCorePack]);

describe('quantity kinds', () => {
  it('refuses to convert count to stop', () => {
    const r = compiled();
    if (!r.ok) throw new Error('compile failed');
    const c = r.value.units.convert(q(3, unitKey('count')), unitKey('stop'));
    expect(!c.ok && c.error.code).toBe('KIND_MISMATCH');
  });

  it('refuses to convert stop to EV', () => {
    const r = compiled();
    if (!r.ok) throw new Error('compile failed');
    const c = r.value.units.convert(q(3, unitKey('stop')), unitKey('EV'));
    expect(!c.ok && c.error.code).toBe('KIND_MISMATCH');
  });

  it('still converts MP to count and percent to ratio', () => {
    const r = compiled();
    if (!r.ok) throw new Error('compile failed');
    const mp = r.value.units.convert(q(24, unitKey('MP')), unitKey('count'));
    expect(isOk(mp) && mp.value.value).toBeCloseTo(24_000_000);
    const pc = r.value.units.convert(q(50, unitKey('percent')), unitKey('ratio'));
    expect(isOk(pc) && pc.value.value).toBeCloseTo(0.5);
  });

  it('rejects a stop JND on a count-output capability', () => {
    const base = photographyCorePack.capabilities.find((c) => c.key === 'redundancy.card_slots')!;
    const broken = {
      ...photographyCorePack,
      capabilities: [{ ...base, output: { ...(base.output as never), jnd: q(1, unitKey('stop')) } }],
    };
    const r = compileOntology([coreUnitsPack, broken as never]);
    expect(!r.ok && r.error.some((e) => e.code === 'JND_KIND_MISMATCH')).toBe(true);
  });
});
