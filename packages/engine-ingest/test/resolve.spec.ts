import { describe, expect, it } from 'vitest';
import { nameSimilarity, normaliseName, resolveAgainst, type EntityRecord } from '../src/resolve.js';
import type { ParsedDocument } from '../src/parse/index.js';

const entity = (entityId: string, canonicalName: string, over: Partial<EntityRecord> = {}): EntityRecord => ({
  entityId,
  canonicalName,
  manufacturer: 'Canon',
  aliases: [],
  skus: [],
  ...over,
});

const doc = (modelName: string | null, sku: string | null = null): ParsedDocument => ({
  claims: [],
  identity: { modelName, manufacturer: null, sku },
  unparsed: [],
});

describe('normaliseName', () => {
  it('collapses mark notation', () => {
    expect(normaliseName('Canon EOS R6 Mark II')).toBe(normaliseName('canon eos r6 mii'));
  });
});

describe('nameSimilarity', () => {
  it('is 1 for equivalent names', () => {
    expect(nameSimilarity('Canon EOS R6 Mark II', 'canon eos r6 mark ii')).toBe(1);
  });

  it('separates different generations', () => {
    expect(nameSimilarity('Canon EOS R6', 'Canon EOS R6 Mark II')).toBeLessThan(0.92);
  });
});

describe('resolveAgainst', () => {
  const entities = [entity('e:r6ii', 'Canon EOS R6 Mark II'), entity('e:r5', 'Canon EOS R5')];

  it('resolves an exact name match', () => {
    const r = resolveAgainst(entities, doc('Canon EOS R6 Mark II'), null);
    expect(r).toMatchObject({ kind: 'resolved', entityId: 'e:r6ii', basis: 'name_match' });
  });

  it('prefers an unambiguous sku over name matching', () => {
    const withSku = [entity('e:r6ii', 'Something Else', { skus: ['5666C002'] }), entities[1]];
    const r = resolveAgainst(withSku, doc('Unrecognisable', '5666C002'), null);
    expect(r).toMatchObject({ kind: 'resolved', basis: 'sku_exact', confidence: 1 });
  });

  it('quarantines a sku mapping to several entities', () => {
    const dupes = [
      entity('e:a', 'A', { skus: ['X1'] }),
      entity('e:b', 'B', { skus: ['X1'] }),
    ];
    expect(resolveAgainst(dupes, doc('A', 'X1'), null).kind).toBe('quarantined');
  });

  it('quarantines two near-equal candidates rather than picking the better', () => {
    const twins = [entity('e:a', 'Alpha 7 IV'), entity('e:b', 'Alpha 7 IV')];
    const r = resolveAgainst(twins, doc('Alpha 7 IV'), null);
    expect(r.kind).toBe('quarantined');
    if (r.kind === 'quarantined') expect(r.candidates).toHaveLength(2);
  });

  it('reports unknown rather than forcing a weak match', () => {
    const r = resolveAgainst(entities, doc('Nikon Z8'), null);
    expect(r).toMatchObject({ kind: 'unknown_entity', observedName: 'Nikon Z8' });
  });

  it('resolves via an alias', () => {
    const aliased = [entity('e:r6ii', 'Canon EOS R6 Mark II', { aliases: ['R6II'] })];
    expect(resolveAgainst(aliased, doc('R6II'), null).kind).toBe('resolved');
  });

  it('prefers an explicit hint over the document title', () => {
    const r = resolveAgainst(entities, doc('Canon EOS R5'), { entityLabel: 'Canon EOS R6 Mark II' });
    expect(r).toMatchObject({ kind: 'resolved', entityId: 'e:r6ii' });
  });

  it('reports unknown when the document has no identity signal', () => {
    expect(resolveAgainst(entities, doc(null), null).kind).toBe('unknown_entity');
  });
});
