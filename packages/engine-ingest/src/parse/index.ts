import type { RawArtifact, RawRef } from '../raw.js';
import type { ParseOutput, Parser as ContractParser } from './contract.js';

export interface ParsedClaim {
  attribute: string;
  value: number;
  unit: string;
  rawText: string;
  outlierFlags: string[];
}

export interface ParsedDocument {
  claims: ParsedClaim[];
  identity: { modelName: string | null; manufacturer: string | null; sku: string | null };
  unparsed: { label: string; text: string; reason: string }[];
}

export type { ClaimDraft, UnmappedField, ParseOutput } from './contract.js';

export interface Parser {
  readonly parserId: string;
  parse(raw: RawRef): ParsedDocument;
}

export class ParserRegistry {
  private readonly parsers = new Map<string, ContractParser>();
  constructor(parsers: readonly ContractParser[] = []) { for (const p of parsers) this.register(p); }
  register(parser: ContractParser): void {
    if (this.parsers.has(parser.id)) throw new Error(`duplicate parser ${parser.id}`);
    this.parsers.set(parser.id, parser);
  }
  get(parserId: string): ContractParser {
    const p = this.parsers.get(parserId);
    if (!p) throw new Error(`unknown parser "${parserId}"`);
    return p;
  }
}

export const asLegacyRef = (a: RawArtifact): RawRef => ({
  contentHash: a.rawId,
  sourceId: a.sourceId,
  url: a.locator,
  etag: a.validators.etag ?? null,
  fetchedAt: a.fetchedAt,
  runId: '',
  byteLength: a.byteSize,
  text: a.encoding === 'utf-8' ? a.body : '',
});

export const legacyDocument = (parsed: ParseOutput, identity: ParsedDocument['identity'], unparsed: ParsedDocument['unparsed']): ParseOutput & ParsedDocument => ({
  ...parsed,
  claims: parsed.drafts
    .filter((d): d is typeof d & { value: { kind: 'quantity'; value: number; unit: string } } => d.value.kind === 'quantity')
    .map((d) => ({ attribute: d.attributeKey, value: d.value.value, unit: d.value.unit, rawText: d.excerpt, outlierFlags: [] })),
  identity,
  unparsed,
});
