#!/usr/bin/env node
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
const WRITE=process.argv.includes('--write'), ROOTS=['packages','apps'];
const SPEC=/(from\s*|import\s*\(\s*|import\s+)(['"])(\.[^'"]*)\2/g; const SKIP=/\.(js|json|css|svg|png|mjs|cjs)$/;
const exists=p=>stat(p).then(()=>true,()=>false);
async function walk(dir,out=[]){let es;try{es=await readdir(dir,{withFileTypes:true})}catch{return out}for(const e of es){if(['node_modules','dist'].includes(e.name)||e.name.startsWith('.'))continue;const p=join(dir,e.name);if(e.isDirectory())await walk(p,out);else if(/\.(ts|tsx|mts)$/.test(e.name)&&!e.name.endsWith('.d.ts'))out.push(p)}return out}
let n=0,u=[];for(const root of ROOTS){for(const file of await walk(root)){const src=await readFile(file,'utf8');let last=0,changed=false,out=[];for(const m of src.matchAll(SPEC)){const [full,prefix,q,spec]=m;if(SKIP.test(spec))continue;const base=resolve(dirname(file),spec);let suf;if(await exists(base+'.ts')||await exists(base+'.tsx'))suf='.js';else if(await exists(join(base,'index.ts'))||await exists(join(base,'index.tsx')))suf='/index.js';else{u.push(`${file}: '${spec}'`);continue}out.push(src.slice(last,m.index),`${prefix}${q}${spec}${suf}${q}`);last=m.index+full.length;changed=true;n++}if(changed){out.push(src.slice(last));if(WRITE)await writeFile(file,out.join(''),'utf8')}}}
console.log(`${n} specifier(s) ${WRITE?'rewritten':'to rewrite'}`);if(u.length){console.log(`\n${u.length} unresolved:`);u.forEach(x=>console.log(x))}
