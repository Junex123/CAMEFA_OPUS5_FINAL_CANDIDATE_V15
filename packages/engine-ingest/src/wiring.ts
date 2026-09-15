import { MemoryRawStore, type RawStorePort } from './raw.js';
import type { Parser as ContractParser } from './parse/contract.js';
import { specTableParser } from './parse/spec-table.js';
import { labMeasurementParser } from './parse/lab-measurement.js';
import { mountGeometryParser } from './parse/mount-geometry.js';
import type { AliasIndexPort, Candidate } from './resolve.js';
import type { CohortPort } from './promote.js';
import type { Adjudication } from './reliability.js';
import type { EntityId } from '@camefa/engine-kernel';

class MemoryAliasIndex implements AliasIndexPort {
  private readonly aliases = new Map<string,{entityId:EntityId;entityType:string}>();
  private readonly labels = new Map<EntityId,{label:string;entityType:string}>();
  async byAlias(alias:string){ return this.aliases.get(alias)??null; }
  async search(_normalizedKey:string, entityType:string, _limit:number):Promise<readonly Candidate[]> {
    return [...this.labels.entries()].filter(([,v])=>v.entityType===entityType).map(([entityId,v])=>({entityId,label:v.label,score:0}));
  }
  async createEntity(normalizedKey:string, entityType:string, label:string){ const id=normalizedKey as EntityId; this.labels.set(id,{label,entityType}); return id; }
  async addAlias(entityId:EntityId, alias:string, _sourceId:string){ const meta=this.labels.get(entityId); if(meta) this.labels.set(entityId,meta); this.aliases.set(alias,{entityId,entityType:meta?.entityType??''}); }
}

class MemoryCohorts implements CohortPort { async values(_attributeKey:string,_entityType:string){ return []; } }

export interface IngestDeps {
  raw: RawStorePort;
  parsers: readonly ContractParser[];
  index: AliasIndexPort;
  cohorts: CohortPort;
  adjudications: readonly Adjudication[];
}

export function defaultParsers(): readonly ContractParser[] { return [specTableParser,labMeasurementParser,mountGeometryParser]; }
export async function wireMemory(): Promise<IngestDeps> { return { raw:new MemoryRawStore(), parsers:defaultParsers(), index:new MemoryAliasIndex(), cohorts:new MemoryCohorts(), adjudications:[] }; }
export async function wire(dbUrl:string):Promise<IngestDeps>{ if(!dbUrl) return wireMemory(); throw new Error('persistent ingest wiring not implemented; run with --dry-run or supply an in-memory harness'); }
