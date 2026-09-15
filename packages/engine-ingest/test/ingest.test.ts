import { describe, it, expect } from 'vitest';
import { specTableParser } from '../src/parse/spec-table.js';
import { parseValue, parseRange } from '../src/parse/value.js';
import { normalizeEntityKey, resolveEntity } from '../src/resolve.js';
import { detectOutlier } from '../src/outlier.js';
import { scoreSource } from '../src/reliability.js';
import { promoteDrafts } from '../src/promote.js';
import { rankCoverageGaps } from '../src/coverage.js';
import { canonicalizeLocator } from '../src/fetch.js';
import { htmlFixture, fakeAliasIndex, fakeCohorts, testOntology } from '@camefa/engine-testkit';

describe('value normalization', () => {
  it('converts every shutter and mass dialect to one canonical unit', () => {
    expect(parseValue('1/8000 sec')).toEqual({ value: 1 / 8000, unit: 's' });
    expect(parseValue('30s')).toEqual({ value: 30, unit: 's' });
    expect(parseValue('f/2.8')).toEqual({ value: 2.8, unit: 'fnumber' });
    expect(parseValue('1:2.8')).toEqual({ value: 2.8, unit: 'fnumber' });
    expect(parseValue('1.53 kg')).toEqual({ value: 1530, unit: 'g' });
    expect(parseValue('26.1 oz')!.value).toBeCloseTo(740.0, 0);
    expect(parseValue('ISO 100-51200')).toEqual({ value: 51200, unit: 'iso' });
    expect(parseValue('-6 EV')).toEqual({ value: -6, unit: 'EV' });
    expect(parseValue('approx. 2280 shots')).toEqual({ value: 2280, unit: 'frame' });
  });

  it('returns null rather than guessing on prose', () => {
    expect(parseValue('varies by lens')).toBeNull();
    expect(parseValue('see manual')).toBeNull();
    expect(parseValue('')).toBeNull();
  });

  it('splits ranges instead of silently truncating them', () => {
    expect(parseRange('24-70mm')).toEqual({ lo: 24, hi: 70, unit: 'mm' });
    expect(parseRange('70 – 200 mm')).toEqual({ lo: 70, hi: 200, unit: 'mm' });
    expect(parseRange('reversed 200-70mm')).toBeNull();
  });
});

describe('spec-table parser', () => {
  const parsed = specTableParser.parse(htmlFixture('body-spec-table.html'));

  it('is pure — identical input yields byte-identical output', () => {
    const again = specTableParser.parse(htmlFixture('body-spec-table.html'));
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(again));
  });

  it('extracts canonical quantities with a verbatim excerpt on every draft', () => {
    const mass = parsed.drafts.find((d) => d.attributeKey === 'body.mass')!;
    expect(mass.value).toEqual({ kind: 'quantity', value: 737, unit: 'g' });
    expect(parsed.drafts.every((d) => d.excerpt.length > 0)).toBe(true);
  });

  it('reads card slots from prose that contains no bare integer', () => {
    const slots = parsed.drafts.find((d) => d.attributeKey === 'body.card_slots')!;
    expect(slots.value).toEqual({ kind: 'quantity', value: 2, unit: 'count' });
    expect(slots.extractionConfidence).toBeLessThan(0.8); // honest about the heuristic
  });

  it('logs unmapped fields rather than discarding them', () => {
    expect(parsed.unmapped.length).toBeGreaterThan(0);
    expect(parsed.unmapped.every((u) => u.rawValue.length > 0)).toBe(true);
    expect(parsed.unmapped.some((u) => u.reason === 'no_attribute_match')).toBe(true);
  });

  it('flags duplicate labels instead of letting the last row win', () => {
    const dup = specTableParser.parse(htmlFixture('body-duplicate-labels.html'));
    expect(dup.unmapped.some((u) => u.reason === 'ambiguous_label')).toBe(true);
    expect(dup.drafts.filter((d) => d.attributeKey === 'body.mass')).toHaveLength(1);
  });
});

describe('entity resolution', () => {
  it('strips retailer noise while preserving model tokens', () => {
    expect(normalizeEntityKey('Sony α7R V Mirrorless Camera (Body Only) — New')).toBe('sony a7r v');
    expect(normalizeEntityKey('Canon EOS R5 Mark II Body w/ 24-105mm Kit')).toBe('canon eos r5 mark ii');
  });

  it('quarantines an ambiguous match instead of merging two products', async () => {
    const index = fakeAliasIndex({
      search: [
        { entityId: 'e1' as any, label: 'AX Pro II', score: 0.94 },
        { entityId: 'e2' as any, label: 'AX Pro III', score: 0.93 },
      ],
    });
    const r = await resolveEntity({ sourceEntityKey: 'AX Pro', entityType: 'body', sourceId: 's1', index, allowCreate: true });
    expect(r.kind).toBe('quarantined');
    if (r.kind === 'quarantined') expect(r.reason).toBe('ambiguous_match');
  });

  it('refuses a high fuzzy score when no model number is shared', async () => {
    const index = fakeAliasIndex({ search: [{ entityId: 'e9' as any, label: 'AX Flagship 3', score: 0.95 }] });
    const r = await resolveEntity({ sourceEntityKey: 'AX Flagship 9', entityType: 'body', sourceId: 's1', index, allowCreate: true });
    expect(r.kind).toBe('quarantined');
  });

  it('quarantines the dangerous middle band rather than creating a near-duplicate', async () => {
    const index = fakeAliasIndex({ search: [{ entityId: 'e3' as any, label: 'AX Hybrid', score: 0.71 }] });
    const r = await resolveEntity({ sourceEntityKey: 'AX Hybrid II', entityType: 'body', sourceId: 's1', index, allowCreate: true });
    expect(r.kind).toBe('quarantined');
    if (r.kind === 'quarantined') expect(r.reason).toBe('below_match_threshold');
  });

  it('refuses to merge across entity types', async () => {
    const index = fakeAliasIndex({ alias: { entityId: 'e4' as any, entityType: 'lens' } });
    const r = await resolveEntity({ sourceEntityKey: 'AX 35', entityType: 'body', sourceId: 's1', index, allowCreate: true });
    expect(r.kind).toBe('quarantined');
    if (r.kind === 'quarantined') expect(r.reason).toBe('type_conflict');
  });
});

describe('outlier detection', () => {
  const masses = [409, 429, 461, 493, 513, 659, 670, 699, 737, 738, 890, 1115];

  it('accepts the heaviest legitimate body in the cohort', () => {
    expect(detectOutlier(1115, masses).isOutlier).toBe(false);
  });

  it('flags a decimal-point error with a graduated confidence penalty', () => {
    const v = detectOutlier(7370, masses);
    expect(v.isOutlier).toBe(true);
    expect(v.confidenceFactor).toBeLessThan(0.6);
    expect(v.note).toContain('deviations from cohort median');
  });

  it('judges log-distributed attributes in log space', () => {
    const isos = [3200, 3200, 6400, 6400, 12800, 12800, 12800, 25600, 25600];
    // A genuine one-stop step up must not be flagged as an error.
    expect(detectOutlier(51200, isos, { log: true }).isOutlier).toBe(false);
    expect(detectOutlier(51200, isos, { log: false }).isOutlier).toBe(true);
  });

  it('declines to judge a cohort too small to be robust', () => {
    const v = detectOutlier(9999, [400, 500, 600]);
    expect(v.isOutlier).toBe(false);
    expect(v.note).toContain('cohort too small');
  });
});

describe('source reliability', () => {
  it('starts a new source at genuine uncertainty, not at full trust', () => {
    const s = scoreSource({ sourceId: 'new', attributeKey: null, log: [], now: '2026-03-01T00:00:00.000Z' });
    expect(s.mean).toBeCloseTo(0.5, 2);
    expect(s.conservative).toBeLessThan(0.35);
    expect(s.effectiveN).toBe(0);
  });

  it('rewards a long agreement history and punishes disagreement', () => {
    const at = '2026-02-01T00:00:00.000Z';
    const agree = Array.from({ length: 60 }, () => ({ sourceId: 'a', attributeKey: 'body.mass', outcome: 'agreed' as const, at }));
    const mixed = [...agree.slice(0, 30), ...Array.from({ length: 30 }, () => ({ sourceId: 'a', attributeKey: 'body.mass', outcome: 'disagreed' as const, at }))];
    const now = '2026-03-01T00:00:00.000Z';

    const good = scoreSource({ sourceId: 'a', attributeKey: 'body.mass', log: agree, now });
    const bad = scoreSource({ sourceId: 'a', attributeKey: 'body.mass', log: mixed, now });
    expect(good.conservative).toBeGreaterThan(0.9);
    expect(bad.conservative).toBeLessThan(0.65);
  });

  it('decays stale evidence so old accuracy does not imply current accuracy', () => {
    const log = Array.from({ length: 40 }, () => ({ sourceId: 'a', attributeKey: null, outcome: 'agreed' as const, at: '2019-01-01T00:00:00.000Z' }));
    const fresh = scoreSource({ sourceId: 'a', attributeKey: null, log: log.map((l) => ({ ...l, at: '2026-02-01T00:00:00.000Z' })), now: '2026-03-01T00:00:00.000Z' });
    const stale = scoreSource({ sourceId: 'a', attributeKey: null, log, now: '2026-03-01T00:00:00.000Z' });
    expect(stale.conservative).toBeLessThan(fresh.conservative);
    expect(stale.effectiveN).toBeLessThan(fresh.effectiveN);
  });

  it('is scoped per attribute, so price accuracy does not imply spec accuracy', () => {
    const log = Array.from({ length: 50 }, () => ({ sourceId: 'r', attributeKey: 'commerce.price', outcome: 'agreed' as const, at: '2026-02-01T00:00:00.000Z' }));
    const price = scoreSource({ sourceId: 'r', attributeKey: 'commerce.price', log, now: '2026-03-01T00:00:00.000Z' });
    const readout = scoreSource({ sourceId: 'r', attributeKey: 'sensor.readout_time', log, now: '2026-03-01T00:00:00.000Z' });
    expect(price.conservative).toBeGreaterThan(readout.conservative + 0.2);
  });
});

describe('promotion', () => {
  it('produces content-addressed claims with a full provenance chain', async () => {
    const parsed = specTableParser.parse(htmlFixture('body-spec-table.html'));
    const r = await promoteDrafts({
      parsed, sourceId: 'manufacturer.spec', entityType: 'body', now: '2026-03-01T00:00:00.000Z',
      ontology: testOntology(), index: fakeAliasIndex({ alias: { entityId: 'body.ax_flagship' as any, entityType: 'body' } }),
      cohorts: fakeCohorts(), adjudications: [], allowCreate: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const claim = r.value.promoted.find((c) => c.attributeKey === 'body.mass')!;
    expect(claim.provenance.rawId).toBe(parsed.rawId);
    expect(claim.provenance.parserVersion).toBe('1.0.0');
    expect(claim.provenance.excerpt).toContain('737');
    expect(claim.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('re-promoting the same artifact is idempotent', async () => {
    const run = () => promoteDrafts({
      parsed: specTableParser.parse(htmlFixture('body-spec-table.html')),
      sourceId: 'manufacturer.spec', entityType: 'body', now: '2026-03-01T00:00:00.000Z',
      ontology: testOntology(), index: fakeAliasIndex({ alias: { entityId: 'body.ax_flagship' as any, entityType: 'body' } }),
      cohorts: fakeCohorts(), adjudications: [], allowCreate: false,
    });
    const [a, b] = await Promise.all([run(), run()]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.promoted.map((c) => c.id)).toEqual(b.value.promoted.map((c) => c.id));
  });

  it('rejects a quantity whose unit kind contradicts the attribute', async () => {
    const parsed = {
      parserId: 'test', parserVersion: '1.0.0', rawId: 'r1', unmapped: [], diagnostics: [],
      drafts: [{ sourceEntityKey: 'AX Flagship', attributeKey: 'body.mass', value: { kind: 'quantity' as const, value: 6, unit: 'stop' }, excerpt: '6 stops', extractionConfidence: 0.9 }],
    };
    const r = await promoteDrafts({
      parsed, sourceId: 's', entityType: 'body', now: '2026-03-01T00:00:00.000Z',
      ontology: testOntology(), index: fakeAliasIndex({ alias: { entityId: 'body.ax_flagship' as any, entityType: 'body' } }),
      cohorts: fakeCohorts(), adjudications: [], allowCreate: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.promoted).toHaveLength(0);
      expect(r.value.rejected[0]!.reason).toContain('kind mismatch');
    }
  });

  it('a low-reliability source yields low-confidence claims, not excluded ones', async () => {
    const parsed = specTableParser.parse(htmlFixture('body-spec-table.html'));
    const disagreements = Array.from({ length: 40 }, () => ({ sourceId: 'sketchy', attributeKey: null, outcome: 'disagreed' as const, at: '2026-02-01T00:00:00.000Z' }));
    const r = await promoteDrafts({
      parsed, sourceId: 'sketchy', entityType: 'body', now: '2026-03-01T00:00:00.000Z',
      ontology: testOntology(), index: fakeAliasIndex({ alias: { entityId: 'body.ax_flagship' as any, entityType: 'body' } }),
      cohorts: fakeCohorts(), adjudications: disagreements, allowCreate: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.promoted.length).toBeGreaterThan(0);
      expect(r.value.promoted.every((c) => c.confidence < 0.25)).toBe(true);
    }
  });
});

describe('coverage', () => {
  it('ranks a hard-gate gap above a larger gap with no gating requirement', () => {
    const gaps = rankCoverageGaps({
      missing: new Map([['body.card_slots', 4], ['sensor.type', 200]]),
      attributeToCapabilities: new Map([
        ['body.card_slots', ['redundancy.card_slots']],
        ['sensor.type', ['tonal.color_response']],
      ]),
      capabilityDemand: new Map([
        ['redundancy.card_slots', [{ profileId: 'activity.wedding.documentary', hard: true, weight: 1 }]],
        ['tonal.color_response', [{ profileId: 'activity.product.studio', hard: false, weight: 0.36 }]],
      ]),
      profileTraffic: new Map([['activity.wedding.documentary', 0.31], ['activity.product.studio', 0.04]]),
    });
    expect(gaps[0]!.attributeKey).toBe('body.card_slots');
    expect(gaps[0]!.priority).toBe(1);
    expect(gaps[0]!.blockedProfiles).toEqual(['activity.wedding.documentary']);
  });
});

describe('locator canonicalization', () => {
  it('dedupes the same page reached by different parameter orders', () => {
    expect(canonicalizeLocator('https://Example.COM/specs?b=2&a=1#tab'))
      .toBe(canonicalizeLocator('https://example.com/specs?a=1&b=2'));
  });
});
