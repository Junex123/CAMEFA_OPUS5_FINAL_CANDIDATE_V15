import { describe, expect, it } from 'vitest';
import {
  assertPathAllowed,
  assertPromotable,
  buildRegistry,
  SourcePolicyError,
  type SourceDescriptor,
} from '../src/sources/registry.js';

const src = (over: Partial<SourceDescriptor> = {}): SourceDescriptor => ({
  sourceId: 'src:test',
  kind: 'manufacturer_spec',
  origin: 'https://example.com',
  licence: 'factual_only',
  attributionRequired: true,
  crawlDelayMs: 1000,
  maxConcurrency: 1,
  pathAllowlist: ['/product/'],
  parser: 'spec-table@2',
  attributeScope: ['weight_g'],
  reliabilityPrior: 0.8,
  anchorEligible: false,
  ...over,
});

describe('source policy', () => {
  it('refuses promotion from an unclassified licence', () => {
    expect(() => assertPromotable(src({ licence: 'unclassified' }), 'weight_g')).toThrow(
      SourcePolicyError,
    );
  });

  it('refuses attributes outside the declared scope', () => {
    expect(() => assertPromotable(src(), 'dr_stops_base')).toThrow(/not in scope/);
  });

  it('refuses cross-origin and non-allowlisted paths', () => {
    expect(() => assertPathAllowed(src(), 'https://evil.com/product/x')).toThrow(/cross-origin/);
    expect(() => assertPathAllowed(src(), 'https://example.com/admin')).toThrow(/allowlisted/);
  });

  it('rejects duplicate source ids at registry build', () => {
    expect(() => buildRegistry([src(), src()])).toThrow(/duplicate/);
  });
});
