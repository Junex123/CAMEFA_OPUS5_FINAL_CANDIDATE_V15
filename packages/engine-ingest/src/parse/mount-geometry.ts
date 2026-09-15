import type { Parser } from './contract.js';
import type { RawArtifact } from '../raw.js';

export const mountGeometryParser: Parser = {
  id:'mount-geometry', version:'1.0.0', accepts:(a)=>/json|text\/plain/i.test(a.contentType),
  parse(raw:RawArtifact){
    let rows:any[]=[]; try { rows=JSON.parse(raw.encoding==='utf-8'?raw.body:''); } catch(e){ return {parserId:'mount-geometry',parserVersion:'1.0.0',rawId:raw.rawId,drafts:[],unmapped:[],diagnostics:[e instanceof Error?e.message:'invalid json']}; }
    const row=rows[0]; if(!row) return {parserId:'mount-geometry',parserVersion:'1.0.0',rawId:raw.rawId,drafts:[],unmapped:[],diagnostics:['empty registry']};
    const key=String(row.mount??raw.locator); const drafts=[
      {sourceEntityKey:key,attributeKey:'mount.flange_distance',value:{kind:'quantity' as const,value:row.flangeDistanceMm,unit:'mm'},excerpt:String(row.flangeDistanceMm),extractionConfidence:0.99},
      {sourceEntityKey:key,attributeKey:'mount.throat_diameter',value:{kind:'quantity' as const,value:row.throatDiameterMm,unit:'mm'},excerpt:String(row.throatDiameterMm),extractionConfidence:0.99},
    ];
    return {parserId:'mount-geometry',parserVersion:'1.0.0',rawId:raw.rawId,drafts,unmapped:[],diagnostics:[]};
  },
};
