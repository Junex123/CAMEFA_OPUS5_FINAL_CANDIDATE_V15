#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
const ROOTS = ['packages', 'apps', 'ontology-packs'];
const SURFACES = ['src', 'test', 'app'];
const SPEC = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const errors = [];
const exists = async (p) => stat(p).then(() => true, () => false);
async function walk(dir, out = []) {
  if (!(await exists(dir))) return out;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(ts|tsx|mts|mjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
const pkgs = new Map();
for (const root of ROOTS) {
  if (!(await exists(root))) continue;
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = join(root, e.name);
    const manifestPath = join(dir, 'package.json');
    if (!(await exists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    pkgs.set(manifest.name, { dir, manifest, deps: new Set() });
  }
}
for (const [name, pkg] of pkgs) {
  const files = [];
  for (const surface of SURFACES) await walk(join(pkg.dir, surface), files);
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    for (const [, spec] of src.matchAll(SPEC)) {
      if (spec.startsWith('.')) {
        if (!/\.(js|json|css)$/.test(spec)) {
          errors.push(file + ": relative import '" + spec + "' must end in .js (ADR-080)");
          continue;
        }
        const target = resolve(dirname(file), spec).replace(/\.js$/, '');
        if (!(await exists(target + '.ts')) && !(await exists(target + '.tsx')) && !(await exists(join(target, 'index.ts')))) {
          errors.push(file + ": unresolved relative import '" + spec + "'");
        }
      } else if (spec.startsWith('@camefa/')) {
        const match = spec.match(/^(@camefa\/[^/]+)(\/.*)?$/);
        const scope = match?.[1];
        const sub = match?.[2];
        if (!scope || !pkgs.has(scope)) {
          errors.push(file + ": unknown workspace package '" + (scope ?? spec) + "'");
          continue;
        }
        if (sub) errors.push(file + ": deep subpath import '" + spec + "' forbidden (ADR-080)");
        const declared = { ...pkg.manifest.dependencies, ...pkg.manifest.devDependencies, ...(pkg.manifest.peerDependencies ?? {}) };
        if (scope !== name && !(scope in declared)) errors.push(relative('.', pkg.dir) + "/package.json: missing dependency '" + scope + "' (imported by " + file + ")");
        if (scope !== name) pkg.deps.add(scope);
      }
    }
  }
}
const state = new Map();
const visit = (n, stack = []) => {
  if (state.get(n) === 'done') return;
  if (state.get(n) === 'open') { errors.push("dependency cycle: " + [...stack, n].join(' -> ')); return; }
  state.set(n, 'open');
  for (const d of pkgs.get(n)?.deps ?? []) visit(d, [...stack, n]);
  state.set(n, 'done');
};
for (const n of pkgs.keys()) visit(n);
if (errors.length) {
  console.error("verify-graph: " + errors.length + " problem(s)\n" + errors.map((e) => "  " + e).join('\n'));
  process.exit(1);
}
console.log("verify-graph: " + pkgs.size + " workspace packages OK");
