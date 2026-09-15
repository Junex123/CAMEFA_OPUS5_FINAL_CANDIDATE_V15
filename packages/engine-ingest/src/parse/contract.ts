import type { RawArtifact } from '../raw.js';

/**
 * ADR-054: parsers are pure functions of (artifact, parserVersion). No network,
 * no clock, no database. Every parser is testable from a checked-in fixture,
 * and a parser change is a version bump that triggers a replay.
 */
export type ClaimDraft = {
  /** Raw entity identifier as the source names it. Resolution happens later. */
  readonly sourceEntityKey: string;
  readonly attributeKey: string;
  readonly value:
    | { readonly kind: 'quantity'; readonly value: number; readonly unit: string }
    | { readonly kind: 'scalar'; readonly value: string | number | boolean };
  /** Exact substring the value came from. Non-negotiable for auditability. */
  readonly excerpt: string;
  /** Parser's own confidence in the extraction, not in the source. */
  readonly extractionConfidence: number;
};

/**
 * Everything the parser saw but could not map. This log is the roadmap for
 * ontology growth — an attribute appearing in the unmapped log across many
 * sources is an attribute the ontology is missing.
 */
export type UnmappedField = {
  readonly sourceEntityKey: string;
  readonly label: string;
  readonly rawValue: string;
  readonly reason: 'no_attribute_match' | 'unparseable_value' | 'unknown_unit' | 'ambiguous_label';
};

export type ParseOutput = {
  readonly parserId: string;
  readonly parserVersion: string;
  readonly rawId: string;
  readonly drafts: readonly ClaimDraft[];
  readonly unmapped: readonly UnmappedField[];
  readonly diagnostics: readonly string[];
};

export type Parser = {
  readonly id: string;
  readonly version: string;
  readonly accepts: (a: RawArtifact) => boolean;
  readonly parse: (a: RawArtifact) => ParseOutput;
};
