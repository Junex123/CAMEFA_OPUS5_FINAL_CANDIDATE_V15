import type { Parser, ParseOutput, ClaimDraft } from './contract.js';
import type { RawArtifact } from '../raw.js';

export const labMeasurementParser: Parser = {
  id:'lab-measurement', version:'1.0.0', accepts:(a)=>/json|text\/plain/i.test(a.contentType),
  parse(raw:RawArtifact): ParseOutput {
    let p:any; try { p=JSON.parse(raw.encoding==='utf-8'?raw.body:''); } catch(e) { return {parserId:'lab-measurement',parserVersion:'1.0.0',rawId:raw.rawId,drafts:[],unmapped:[],diagnostics:[e instanceof Error?e.message:'invalid json']}; }
    const drafts:ClaimDraft[]=[]; const key=p?.camera?.model??raw.locator;
    const add=(attributeKey:string,value:number,unit:string)=>{ if(Number.isFinite(value)) drafts.push({sourceEntityKey:key,attributeKey,value:{kind:'quantity',value,unit},excerpt:String(value),extractionConfidence:0.99}); };
    add('sensor.dynamic_range',p?.measurements?.dynamicRange?.base,'stop'); add('sensor.color_depth',p?.measurements?.colorDepth,'count'); add('sensor.low_light_iso',p?.measurements?.lowLightIso,'iso');
    return {parserId:'lab-measurement',parserVersion:'1.0.0',rawId:raw.rawId,drafts,unmapped:[],diagnostics:[]};
  },
};
