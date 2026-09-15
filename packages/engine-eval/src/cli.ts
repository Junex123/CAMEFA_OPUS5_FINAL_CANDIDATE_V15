#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { buildGoldenSet, type Waiver } from './golden.js';
import { DEFAULT_THRESHOLDS, evaluateGate } from './gate.js';
import { renderMarkdown } from './report.js';
import { replayGoldenSet } from './replay.js';
import { loadEngine, loadBaselines } from './harness-loader.js';

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const value = hit?.slice(name.length + 3) ?? fallback;
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf8')) as T;

async function main(): Promise<number> {
  const set = buildGoldenSet(
    arg('set-id', 'default'),
    await readJson(arg('golden')),
  );
  const waivers = await readJson<Waiver[]>(arg('waivers', '/dev/null')).catch(
    () => [] as Waiver[],
  );
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(await readJson(arg('thresholds', '/dev/null')).catch(() => ({}))),
  };

  const engine = await loadEngine(arg('engine-config'));
  const baselines = await loadBaselines(arg('baseline-url'));

  const run = await replayGoldenSet(set, engine, baselines, Number(arg('concurrency', '4')));
  const gate = evaluateGate(run, thresholds, waivers);

  await writeFile(arg('out-json', 'eval-run.json'), JSON.stringify({ run, gate }, null, 2));
  await writeFile(
    arg('out-md', 'eval-report.md'),
    renderMarkdown(run, gate, arg('web-base-url', '')),
  );

  process.stdout.write(`${gate.verdict}\n`);
  for (const f of gate.findings.filter((x) => x.severity === 'blocking')) {
    process.stdout.write(`  [block] ${f.code}: ${f.message}\n`);
  }

  return gate.verdict === 'fail' ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${(err as Error).stack}\n`);
    process.exit(2);
  },
);
