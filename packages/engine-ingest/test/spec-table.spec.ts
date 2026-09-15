import { describe, expect, it } from 'vitest';
import { specTableParser } from '../src/parse/spec-table.js';
import { toRef } from '../src/raw.js';

const ref = (html: string) =>
  toRef({
    sourceId: 'src:test',
    url: 'https://example.com/product/x',
    body: new TextEncoder().encode(html),
    etag: null,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    runId: 'r1',
  });

describe('specTableParser', () => {
  it('extracts claims from a table', () => {
    const doc = specTableParser.parse(
      ref(`<title>Canon EOS R6 Mark II</title><table>
        <tr><th>Weight</th><td>670 g</td></tr>
        <tr><th>Price</th><td>$2,499</td></tr>
        <tr><th>Flash sync speed</th><td>1/200 s</td></tr>
      </table>`),
    );
    expect(doc.claims.map((c) => [c.attribute, c.value])).toEqual([
      ['flash_sync_s', 0.005],
      ['price_usd', 2499],
      ['weight_g', 670],
    ]);
    expect(doc.identity.modelName).toBe('Canon EOS R6 Mark II');
  });

  it('reads definition lists as well as tables', () => {
    const doc = specTableParser.parse(ref('<dl><dt>Weight</dt><dd>500 g</dd></dl>'));
    expect(doc.claims[0]).toMatchObject({ attribute: 'weight_g', value: 500 });
  });

  it('keeps the first match when a label repeats in a footnote', () => {
    const doc = specTableParser.parse(
      ref(`<table>
        <tr><td>Weight</td><td>670 g</td></tr>
        <tr><td>Weight (with battery)</td><td>810 g</td></tr>
      </table>`),
    );
    expect(doc.claims.filter((c) => c.attribute === 'weight_g')).toHaveLength(1);
    expect(doc.claims[0].value).toBe(670);
  });

  it('records unparseable fields instead of dropping them silently', () => {
    const doc = specTableParser.parse(
      ref('<table><tr><td>Weight</td><td>see specifications</td></tr></table>'),
    );
    expect(doc.claims).toHaveLength(0);
    expect(doc.unparsed[0]).toMatchObject({ label: 'Weight' });
  });

  it('flags approximate source values', () => {
    const doc = specTableParser.parse(
      ref('<table><tr><td>Weight</td><td>approx. 700 g</td></tr></table>'),
    );
    expect(doc.claims[0].outlierFlags).toContain('source_approximate');
  });

  it('retains verbatim source text for diagnosis', () => {
    const doc = specTableParser.parse(
      ref('<table><tr><td>Weight</td><td>670 g (body only)</td></tr></table>'),
    );
    expect(doc.claims[0].rawText).toBe('670 g (body only)');
  });

  it('is pure over the raw text', () => {
    const raw = ref('<table><tr><td>Weight</td><td>670 g</td></tr></table>');
    expect(specTableParser.parse(raw)).toEqual(specTableParser.parse(raw));
  });

  it('ignores unrelated rows', () => {
    const doc = specTableParser.parse(
      ref('<table><tr><td>Warranty</td><td>2 years</td></tr></table>'),
    );
    expect(doc.claims).toHaveLength(0);
    expect(doc.unparsed).toHaveLength(0);
  });
});
