import type { Parser as ContractParser, ClaimDraft, UnmappedField, ParseOutput } from './contract.js';
import { legacyDocument } from './index.js';
import { parseValue, parseRange, parseBoolean, unparseable } from './value.js';
import type { RawArtifact } from '../raw.js';

const LABEL_MAP: Readonly<Record<string, string>> = {
  'sensor type':'sensor.type','effective pixels':'sensor.resolution','iso sensitivity':'sensor.max_usable_iso','iso range':'sensor.max_usable_iso','sensor readout':'sensor.readout_time','dynamic range':'sensor.dynamic_range','lens mount':'body.mount','mount':'body.mount','memory card slots':'body.card_slots','card slots':'body.card_slots','storage media':'body.card_slots','weight':'body.mass','weight (with battery)':'body.mass','battery life':'body.cipa_rating','battery life (cipa)':'body.cipa_rating','af low-light sensitivity':'af.rated_low_light_ev','af detection range':'af.rated_low_light_ev','continuous shooting':'capture.max_fps','burst rate':'capture.max_fps','buffer capacity':'capture.raw_buffer','image stabilization':'body.ibis_rating','in-body stabilization':'body.ibis_rating','weather sealing':'body.weather_sealed','focal length':'lens.focal_range','maximum aperture':'lens.aperture_range','optical stabilization':'lens.os_rating','price':'commerce.price','flash sync speed':'capture.flash_sync_speed',
};
const RANGE_SPLIT: Readonly<Record<string, readonly [string,string]>> = {
  'lens.focal_range':['lens.focal_min','lens.focal_max'],
  'lens.aperture_range':['lens.aperture_wide_min_focal','lens.aperture_wide_max_focal'],
};
const normalizeLabel=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').replace(/[:*†]+$/g,'').trim();
const strip=(s:string)=>s.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#8211;|&ndash;/g,'–').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim();
const extractRows=(html:string):readonly {label:string;value:string}[]=>{
  const rows:{label:string;value:string}[]=[];
  for(const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...m[1]!.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(x=>strip(x[1]!));
    if(cells.length>=2) rows.push({label:cells[0]!,value:cells[1]!});
  }
  for(const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) rows.push({label:strip(m[1]!),value:strip(m[2]!)});
  return rows;
};
const titleOf=(html:string)=>strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]??'')||null;

export const specTableParser: ContractParser & { parseLegacy: (...args: any[]) => any } = {
  id:'spec-table', version:'1.0.0', accepts:(a: RawArtifact)=>/text\/html|application\/xhtml|text\/plain/i.test(a.contentType),
  parse(raw:RawArtifact){
    const html=raw.encoding==='utf-8'?raw.body:''; const identity={modelName:titleOf(html),manufacturer:null,sku:null};
    const drafts:ClaimDraft[]=[]; const unmapped:UnmappedField[]=[]; const seen=new Set<string>();
    for(const row of extractRows(html)){
      const label=normalizeLabel(row.label), attr=LABEL_MAP[label]; if(!attr || seen.has(attr)) continue;
      const range=parseRange(row.value);
      if(range && RANGE_SPLIT[attr]){
        const [loKey,hiKey]=RANGE_SPLIT[attr]!;
        drafts.push({sourceEntityKey:identity.modelName??raw.locator,attributeKey:loKey,value:{kind:'quantity',value:range.lo,unit:range.unit},excerpt:row.value,extractionConfidence:0.97});
        drafts.push({sourceEntityKey:identity.modelName??raw.locator,attributeKey:hiKey,value:{kind:'quantity',value:range.hi,unit:range.unit},excerpt:row.value,extractionConfidence:0.97});
        seen.add(attr); continue;
      }
      const b=parseBoolean(row.value);
      if(b!==null){ drafts.push({sourceEntityKey:identity.modelName??raw.locator,attributeKey:attr,value:{kind:'scalar',value:b},excerpt:row.value,extractionConfidence:0.96}); seen.add(attr); continue; }
      const p=parseValue(row.value);
      if(!p){ unmapped.push(unparseable(identity.modelName??raw.locator,row.label,row.value)); continue; }
      const approx=/\bapprox\.?|\babout\b|~|±/i.test(row.value);
      drafts.push({sourceEntityKey:identity.modelName??raw.locator,attributeKey:attr,value:{kind:'quantity',value:p.value,unit:p.unit},excerpt:row.value,extractionConfidence:approx?0.85:0.97}); seen.add(attr);
    }
    const parsed:ParseOutput={parserId:'spec-table',parserVersion:'1.0.0',rawId:raw.rawId,drafts,unmapped,diagnostics:[]};
    return legacyDocument(parsed,identity,unmapped.map(u=>({label:u.label,text:u.rawValue,reason:u.reason})));
  },
  parseLegacy: (...args:any[]) => (specTableParser as any).parse(...args),
};

export const specTableParserLegacy = specTableParser;
