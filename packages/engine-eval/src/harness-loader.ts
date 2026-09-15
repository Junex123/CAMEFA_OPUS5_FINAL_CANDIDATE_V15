import { canonicalHash } from '@camefa/engine-contracts';
import { createEngine, type Engine, type EngineDeps } from '@camefa/engine-runtime';
import { fingerprintCorpus, parseGoldenQuestion, type GoldenCorpus, type GoldenQuestion } from './corpus.js';
import type { GateConfig, Waiver } from './gates.js';
import type { EpochRef } from './epoch.js';

export interface FileSystemPort {
  readFile(path: string): Promise<string | undefined>;
  readDir(path: string): Promise<readonly string[] | undefined>;
}

export type EngineBinding =
  | { kind: 'in-process'; profile: string; buildFingerprint: string }
  | { kind: 'http'; baseUrl: string; buildFingerprint?: string };

export interface HarnessConfig {
  version: 1;
  corpusDir: string;
  baselineDir: string;
  epoch: EpochRef;
  engine: EngineBinding;
  gates: GateConfig;
  waivers?: readonly Waiver[];
}

export interface Diagnostic {
  code: string;
  message: string;
  path?: string;
}

export interface Harness {
  readonly config: HarnessConfig;
  readonly corpus: GoldenCorpus;
  readonly engine: Engine;
  readonly buildFingerprint: string;
}

export type LoadResult =
  | { ok: true; harness: Harness; warnings: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] };

export interface LoaderOptions {
  fs: FileSystemPort;
  configPath: string;
  /** Profile name -> deps. Registered statically; no dynamic import (ADR-079). */
  engineProfiles: Record<string, Omit<EngineDeps, 'buildFingerprint'>>;
  httpEngineFactory?: (baseUrl: string, fingerprint: string) => Engine;
  now: Date;
}

const GOLDEN_SUFFIX = '.golden.json';

export async function loadHarness(opts: LoaderOptions): Promise<LoadResult> {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  const configRaw = await opts.fs.readFile(opts.configPath);
  if (configRaw === undefined) {
    return { ok: false, diagnostics: [{ code: 'config.missing', message: 'config not readable', path: opts.configPath }] };
  }

  let config: HarnessConfig;
  try {
    config = JSON.parse(configRaw) as HarnessConfig;
  } catch (err) {
    return {
      ok: false,
      diagnostics: [{ code: 'config.malformed', message: (err as Error).message, path: opts.configPath }],
    };
  }
  if (config.version !== 1) {
    errors.push({ code: 'config.version', message: `unsupported config version ${String(config.version)}` });
  }

  // ---- corpus -------------------------------------------------------------
  const entries = await opts.fs.readDir(config.corpusDir);
  if (entries === undefined) {
    errors.push({ code: 'corpus.missing', message: 'corpus directory not readable', path: config.corpusDir });
  }

  const questions: GoldenQuestion[] = [];
  const seen = new Map<string, string>();
  for (const name of (entries ?? []).filter((n) => n.endsWith(GOLDEN_SUFFIX)).slice().sort()) {
    const path = `${config.corpusDir}/${name}`;
    const raw = await opts.fs.readFile(path);
    if (raw === undefined) {
      errors.push({ code: 'corpus.unreadable', message: 'listed but unreadable', path });
      continue;
    }
    const parsed = parseGoldenQuestion(raw);
    if (!parsed.ok) {
      errors.push(...parsed.diagnostics.map((d) => ({ ...d, path })));
      continue;
    }
    const prior = seen.get(parsed.question.id);
    if (prior !== undefined) {
      errors.push({
        code: 'corpus.duplicateId',
        message: `question id ${parsed.question.id} already defined by ${prior}`,
        path,
      });
      continue;
    }
    if (parsed.question.epoch.id !== config.epoch.id) {
      errors.push({
        code: 'corpus.epochMismatch',
        message: `question epoch ${parsed.question.epoch.id} != harness epoch ${config.epoch.id}`,
        path,
      });
      continue;
    }
    seen.set(parsed.question.id, path);
    questions.push(parsed.question);
  }

  if (questions.length === 0 && errors.length === 0) {
    errors.push({ code: 'corpus.empty', message: 'no golden questions found', path: config.corpusDir });
  }

  const fingerprint = fingerprintCorpus(questions, config.epoch);
  const lockRaw = await opts.fs.readFile(`${config.corpusDir}/corpus.lock.json`);
  if (lockRaw === undefined) {
    errors.push({
      code: 'corpus.lockMissing',
      message: 'corpus.lock.json is required; run `camefa-eval lock` to seal the corpus',
      path: config.corpusDir,
    });
  } else {
    const lock = safeParse<{ fingerprint?: string; epoch?: EpochRef }>(lockRaw);
    if (lock?.fingerprint !== fingerprint) {
      errors.push({
        code: 'corpus.fingerprintMismatch',
        message: `corpus fingerprint ${fingerprint} does not match lock ${String(lock?.fingerprint)}`,
      });
    }
    if (lock?.epoch?.id !== config.epoch.id) {
      errors.push({ code: 'corpus.lockEpochMismatch', message: 'lock sealed under a different epoch' });
    }
  }

  // ---- waivers ------------------------------------------------------------
  for (const waiver of config.waivers ?? []) {
    if (!waiver.owner || !waiver.reason) {
      errors.push({ code: 'waiver.incomplete', message: `waiver ${waiver.id} needs owner and reason` });
    }
    if (Date.parse(waiver.expiresAt) <= opts.now.getTime()) {
      errors.push({
        code: 'waiver.expired',
        message: `waiver ${waiver.id} expired at ${waiver.expiresAt}; renew it or fix the regression`,
      });
    }
  }

  // ---- engine binding -----------------------------------------------------
  let engine: Engine | undefined;
  let buildFingerprint = '';
  if (config.engine.kind === 'in-process') {
    const deps = opts.engineProfiles[config.engine.profile];
    if (deps === undefined) {
      errors.push({
        code: 'engine.unknownProfile',
        message: `no registered engine profile '${config.engine.profile}'`,
      });
    } else if (errors.length === 0) {
      try {
        buildFingerprint = config.engine.buildFingerprint;
        engine = createEngine({ ...deps, buildFingerprint });
      } catch (err) {
        errors.push({ code: 'engine.assemblyFailed', message: (err as Error).message });
      }
    }
  } else {
    if (config.gates.mode === 'blocking') {
      errors.push({
        code: 'engine.remoteInBlockingMode',
        message: 'http engine bindings are advisory-only; blocking gates require an in-process pinned build (ADR-079)',
      });
    }
    if (config.engine.buildFingerprint === undefined) {
      warnings.push({
        code: 'engine.unpinned',
        message: 'remote engine has no build fingerprint; results are not reproducible',
      });
    }
    if (errors.length === 0) {
      if (opts.httpEngineFactory === undefined) {
        errors.push({ code: 'engine.noHttpFactory', message: 'http binding requested but no factory supplied' });
      } else {
        buildFingerprint = config.engine.buildFingerprint ?? 'unpinned';
        engine = opts.httpEngineFactory(config.engine.baseUrl, buildFingerprint);
      }
    }
  }

  if (errors.length > 0 || engine === undefined) {
    return { ok: false, diagnostics: errors.length > 0 ? errors : [{ code: 'engine.missing', message: 'engine not constructed' }] };
  }

  return {
    ok: true,
    warnings,
    harness: {
      config,
      corpus: { epoch: config.epoch, fingerprint, questions },
      engine,
      buildFingerprint,
    },
  };
}

/** Emitted by `camefa-eval lock`; kept here so seal and check share one shape. */
export function sealCorpus(corpus: GoldenCorpus): string {
  return `${JSON.stringify({ fingerprint: corpus.fingerprint, epoch: corpus.epoch, count: corpus.questions.length, schema: canonicalHash({ v: 1 }) }, null, 2)}\n`;
}

function safeParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
