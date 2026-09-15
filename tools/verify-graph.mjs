#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';

const ROOTS = ['packages', 'apps'];
const SPEC = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const errors = [];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const pkgs = new Map();
for (const root of ROOTS) {
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = join(root, e.name);
    const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    pkgs.set(manifest.name, { dir, manifest, deps: new Set() });
  }
}

const exists = async (p) => stat(p).then(() => true, () => false);

for (const [name, pkg] of pkgs) {
  for (const file of await walk(join(pkg.dir, 'src'))) {
    const src = await readFile(file, 'utf8');
    for (const [, spec] of src.matchAll(SPEC)) {
      if (spec.startsWith('.')) {
        if (!/\.(js|json|css)$/.test(spec)) {
          errors.push(`${file}: relative import '${spec}' must end in .js (ADR-080)`);
          continue;
        }
        const target = resolve(dirname(file), spec).replace(/\.js$/, '');
        if (!(await exists(`${target}.ts`)) && !(await exists(`${target}.tsx`)) && !(await exists(join(target, 'index.ts')))) {
          errors.push(`${file}: unresolved relative import '${spec}'`);
        }
      } else if (spec.startsWith('@camefa/')) {
        const [, scope, sub] = spec.match(/^(@camefa\/[^/]+)(\/.*)?$/) ?? [];
        if (!pkgs.has(scope)) errors.push(`${file}: unknown workspace package '${scope}'`);
        if (sub) errors.push(`${file}: deep subpath import '${spec}' forbidden (ADR-080)`);
        const declared = { ...pkg.manifest.dependencies, ...pkg.manifest.devDependencies };
        if (scope !== name && !(scope in declared)) {
          errors.push(`${relative('.', pkg.dir)}/package.json: missing dependency '${scope}' (imported by ${file})`);
        }
        if (scope !== name) pkg.deps.add(scope);
      }
    }
  }
}

// cycle detection
const state = new Map();
const visit = (n, stack = []) => {
  if (state.get(n) === 'done') return;
  if (state.get(n) === 'open') {
    errors.push(`dependency cycle: ${[...stack, n].join(' -> ')}`);
    return;
  }
  state.set(n, 'open');
  for (const d of pkgs.get(n)?.deps ?? []) visit(d, [...stack, n]);
  state.set(n, 'done');
};
for (const n of pkgs.keys()) visit(n);

if (errors.length) {
  console.error(`verify-graph: ${errors.length} problem(s)\n` + errors.map((e) => `  ${e}`).join('\n'));
  process.exit(1);
}
console.log(`verify-graph: ${pkgs.size} packages OK`);
