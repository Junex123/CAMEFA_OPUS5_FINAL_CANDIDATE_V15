#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { buildRegistry, type SourceDescriptor } from './sources/registry.js';
import { runIngest, type IngestTarget } from './run.js';
import { planRetirement } from './retire.js';
import { wire } from './wiring.js';

const arg = (name: string, fallback?: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  const v = hit?.slice(name.length + 3) ?? fallback;
  if (v === undefined) throw new Error(`missing --${name}`);
  return v;
};
const readJson = async <T>(p: string): Promise<T> =>
  JSON.parse(await readFile(p, 'utf8')) as T;

async function ingest(): Promise<number> {
  const registry = buildRegistry(await readJson<SourceDescriptor[]>(arg('sources')));
  const targets = await readJson<IngestTarget[]>(arg('targets'));
  const deps = await wire(arg('db-url', process.env.DATABASE_URL ?? ''));

  const report = await runIngest(targets, registry, deps, {
    runId: arg('run-id', randomUUID()),
    dryRun: process.argv.includes('--dry-run'),
    maxFailureRate: Number(arg('max-failure-rate', '0.2')),
  });

  await writeFile(arg('out', 'ingest-run.json'), JSON.stringify(report, null, 2));
  process.stdout.write(
    `epoch ${report.corpusEpoch} · ${report.bySource.reduce((s, x) => s + x.claimsPromoted, 0)} claims promoted\n`,
  );
  for (const s of report.bySource) {
    process.stdout.write(
      `  ${s.sourceId}: ${s.claimsPromoted}/${s.claimsParsed} promoted, ` +
        `${s.quarantined} quarantined, ${s.policyRejected} policy-rejected, ${s.failed} failed\n`,
    );
  }
  if (report.aborted) {
    process.stderr.write(`aborted: ${report.aborted}\n`);
    return 1;
  }
  return 0;
}

async function retire(): Promise<number> {
  const plan = planRetirement(
    await readJson(arg('synthetics')),
    await readJson(arg('reals')),
    await readJson(arg('mapping')),
    (await readJson<string[]>(arg('required-attributes'))) ?? [],
  );
  await writeFile(arg('out', 'retirement-plan.json'), JSON.stringify(plan, null, 2));

  if (!plan.safe) {
    for (const d of plan.danglingReferences) {
      process.stderr.write(
        `dangling: ${d.entityId} still referenced by ${d.referencedBy.join(', ')}\n`,
      );
    }
    for (const u of plan.underCovered) {
      process.stderr.write(`thin: ${u.entityId} missing ${u.missing.join(', ')}\n`);
    }
    return 1;
  }
  process.stdout.write(`${plan.aliases.length} aliases, ${plan.orphanedSynthetics.length} orphans droppable\n`);
  return 0;
}

const commands: Record<string, () => Promise<number>> = { ingest, retire };

const name = process.argv[2] ?? '';
(commands[name] ?? (async () => {
  process.stderr.write(`usage: camefa-ingest <${Object.keys(commands).join('|')}>\n`);
  return 2;
}))().then(
  (c) => process.exit(c),
  (e) => {
    process.stderr.write(`${(e as Error).stack}\n`);
    process.exit(2);
  },
);
