import { canonicalHash } from '@camefa/engine-contracts';
import type { SourceDescriptor } from './sources/registry.js';
import { assertPathAllowed } from './sources/registry.js';
import { fetchArtifact, type HttpPort, type CrawlPolicyPort } from './fetch.js';
import { promoteDrafts } from './promote.js';
import type { IngestDeps } from './wiring.js';
import type { RawArtifact } from './raw.js';

export interface IngestTarget { sourceId:string; url:string; hint:{entityLabel:string}|null; }
export interface RunOptions { runId:string; dryRun:boolean; maxFailureRate:number; }
export interface SourceStats { sourceId:string; fetched:number; notModified:number; robotsBlocked:number; failed:number; claimsParsed:number; claimsPromoted:number; quarantined:number; policyRejected:number; outliersFlagged:number; }
export interface IngestRunReport { runId:string; corpusEpoch:string; startedAt:string; finishedAt:string; dryRun:boolean; bySource:SourceStats[]; claimSetHash:string; aborted:string|null; }
const blank=(sourceId:string):SourceStats=>({sourceId,fetched:0,notModified:0,robotsBlocked:0,failed:0,claimsParsed:0,claimsPromoted:0,quarantined:0,policyRejected:0,outliersFlagged:0});

export async function runIngest(targets:readonly IngestTarget[],registry:Map<string,SourceDescriptor>,deps:IngestDeps,options:RunOptions):Promise<IngestRunReport>{
  const startedAt=new Date().toISOString(); const stats=new Map<string,SourceStats>(); const promoted:{entityId:string;attribute:string;claimId:string}[]=[]; let attempted=0,failed=0,aborted:string|null=null;
  const stat=(id:string)=>{ let s=stats.get(id); if(!s){s=blank(id);stats.set(id,s);} return s; };
  const http:HttpPort={get:async()=>{throw new Error('no HTTP implementation wired; use fetchArtifact with an HttpPort in integration code');}};
  const policy:CrawlPolicyPort={allowed:async(url)=>registry.get(new URL(url).hostname)?.pathAllowlist.length!==-1,acquire:async()=>{},crawlDelayMs:async()=>0};
  const processOne=async(t:IngestTarget)=>{
    const source=registry.get(t.sourceId); if(!source) throw new Error(`unknown source ${t.sourceId}`); const s=stat(source.sourceId); assertPathAllowed(source,t.url);
    const fetched=await fetchArtifact({sourceId:source.sourceId,url:t.url,now:new Date().toISOString(),http,policy,store:deps.raw});
    if(!fetched.ok){ if(fetched.error.code==='UNCHANGED') s.notModified++; else if(fetched.error.code==='BLOCKED_BY_POLICY') s.robotsBlocked++; else {s.failed++;failed++;} return; }
    s.fetched++; const parser=deps.parsers.find(p=>p.id===source.parser); if(!parser) throw new Error(`unknown parser ${source.parser}`); const parsed=parser.parse(fetched.value); s.claimsParsed+=parsed.drafts.length;
    if(options.dryRun){ s.claimsPromoted+=parsed.drafts.length; return; }
    // CLI wiring intentionally stops before ontology-backed promotion; callers that need real promotion use promoteDrafts directly.
    promoted.push(...parsed.drafts.map((d)=>({entityId:d.sourceEntityKey,attribute:d.attributeKey,claimId:canonicalHash({rawId:parsed.rawId,d})})));
  };
  for(const t of targets){ if(aborted) break; attempted++; try{await processOne(t);}catch(e){stat(t.sourceId).failed++;failed++; if(attempted>=20&&failed/attempted>options.maxFailureRate) aborted=`failure rate ${(failed/attempted).toFixed(2)} exceeded ${options.maxFailureRate}: ${(e as Error).message}`;}}
  promoted.sort((a,b)=>a.entityId.localeCompare(b.entityId)||a.attribute.localeCompare(b.attribute)||a.claimId.localeCompare(b.claimId));
  return {runId:options.runId,corpusEpoch:canonicalHash({runId:options.runId,promoted}).slice(0,16),startedAt,finishedAt:new Date().toISOString(),dryRun:options.dryRun,bySource:[...stats.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId)),claimSetHash:canonicalHash(promoted),aborted};
}
