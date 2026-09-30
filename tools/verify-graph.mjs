#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';

const ROOTS = ['packages', 'apps', 'ontology-packs'];
const PRODUCTION_SURFACES = ['src', 'app'];
const TEST_SURFACES = ['test'];
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

async function inspectFile(pkg, file, addGraphEdges) {
  const src = await readFile(file, 'utf8');

  for (const [, spec] of src.matchAll(SPEC)) {
    if (spec.startsWith('.')) {
      const ext = spec.match(/\.[a-z0-9]+$/i)?.[0] ?? '';

      if (ext === '.css' || ext === '.json') {
        const target = resolve(dirname(file), spec);
        if (!(await exists(target))) {
          errors.push(file + ": unresolved relative import '" + spec + "'");
        }
        continue;
      }

      if (ext !== '.js') {
        errors.push(file + ": relative import '" + spec + "' must end in .js (ADR-080)");
        continue;
      }

      const target = resolve(dirname(file), spec).replace(/\.js$/, '');
      const candidates = [
        target + '.ts',
        target + '.tsx',
        target + '.mts',
        target + '.mjs',
        join(target, 'index.ts'),
        join(target, 'index.tsx'),
        join(target, 'index.mts'),
        join(target, 'index.mjs'),
      ];
      let found = false;
      for (const candidate of candidates) {
        if (await exists(candidate)) {
          found = true;
          break;
        }
      }
      if (!found) errors.push(file + ": unresolved relative import '" + spec + "'");
      continue;
    }

    if (spec.startsWith('@camefa/')) {
      const match = spec.match(/^(@camefa\/[^/]+)(\/.*)?$/);
      const scope = match?.[1];
      const sub = match?.[2];

      if (!scope || !pkgs.has(scope)) {
        errors.push(file + ": unknown workspace package '" + (scope ?? spec) + "'");
        continue;
      }

      if (sub) {
        errors.push(file + ": deep subpath import '" + spec + "' forbidden (ADR-080)");
      }

      const declared = {
        ...pkg.manifest.dependencies,
        ...pkg.manifest.devDependencies,
        ...(pkg.manifest.peerDependencies ?? {}),
      };

      if (scope !== pkg.manifest.name && !(scope in declared)) {
        errors.push(
          relative('.', pkg.dir) + "/package.json: missing dependency '" + scope +
          "' (imported by " + file + ")",
        );
      }

      if (addGraphEdges && scope !== pkg.manifest.name) pkg.deps.add(scope);
    }
  }
}

for (const [name, pkg] of pkgs) {
  const productionFiles = [];
  for (const surface of PRODUCTION_SURFACES) await walk(join(pkg.dir, surface), productionFiles);
  for (const file of productionFiles) await inspectFile(pkg, file, true);

  const testFiles = [];
  for (const surface of TEST_SURFACES) await walk(join(pkg.dir, surface), testFiles);
  for (const file of testFiles) await inspectFile(pkg, file, false);
}

const state = new Map();

const visit = (n, stack = []) => {
  if (state.get(n) === 'done') return;
  if (state.get(n) === 'open') {
    errors.push("dependency cycle: " + [...stack, n].join(' -> '));
    return;
  }
  state.set(n, 'open');
  for (const d of pkgs.get(n)?.deps ?? []) visit(d, [...stack, n]);
  state.set(n, 'done');
};

for (const n of pkgs.keys()) visit(n);

if (errors.length) {
  console.error(
    "verify-graph: " + errors.length + " problem(s)\n" +
    errors.map((e) => "  " + e).join('\n'),
  );
  process.exit(1);
}

console.log("verify-graph: " + pkgs.size + " workspace packages OK");
