import { ok, err, type Result } from '@camefa/engine-kernel';
import { rawId, type RawArtifact, type RawStorePort } from './raw.js';

export type FetchFailure = {
  readonly code: 'BLOCKED_BY_POLICY' | 'HTTP_ERROR' | 'TIMEOUT' | 'TOO_LARGE' | 'UNCHANGED';
  readonly detail?: Record<string, unknown>;
  readonly retryable: boolean;
};

export type HttpPort = {
  get(url: string, headers: Record<string, string>, timeoutMs: number): Promise<{
    status: number;
    headers: Record<string, string>;
    body: Uint8Array;
  }>;
};

/** Crawl etiquette is a hard gate, not a config knob. */
export type CrawlPolicyPort = {
  /** robots.txt evaluation for our declared user-agent. */
  allowed(url: string): Promise<boolean>;
  /** Blocks until this source's rate window permits another request. */
  acquire(sourceId: string): Promise<void>;
  crawlDelayMs(sourceId: string): Promise<number>;
};

const MAX_BYTES = 8 * 1024 * 1024;
const USER_AGENT = 'CamefaBot/1.0 (+https://camefa.com/bot)';

/** Sorted query params, no fragment, lowercase host. Makes dedupe work. */
export const canonicalizeLocator = (raw: string): string => {
  const u = new URL(raw);
  u.hash = '';
  u.host = u.host.toLowerCase();
  const params = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  u.search = '';
  for (const [k, v] of params) u.searchParams.append(k, v);
  return u.toString();
};

export const fetchArtifact = async (args: {
  sourceId: string;
  url: string;
  now: string;
  http: HttpPort;
  policy: CrawlPolicyPort;
  store: RawStorePort;
}): Promise<Result<RawArtifact, FetchFailure>> => {
  const locator = canonicalizeLocator(args.url);

  if (!(await args.policy.allowed(locator))) {
    return err({ code: 'BLOCKED_BY_POLICY', detail: { locator }, retryable: false });
  }

  const prior = await args.store.latestFor(args.sourceId, locator);
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: '*/*' };
  if (prior?.validators.etag) headers['if-none-match'] = prior.validators.etag;
  if (prior?.validators.lastModified) headers['if-modified-since'] = prior.validators.lastModified;

  await args.policy.acquire(args.sourceId);

  let res: Awaited<ReturnType<HttpPort['get']>>;
  try {
    res = await args.http.get(locator, headers, 20_000);
  } catch (e) {
    return err({ code: 'TIMEOUT', detail: { kind: e instanceof Error ? e.name : 'unknown' }, retryable: true });
  }

  // A 304 is a success: the artifact we already have is still current.
  if (res.status === 304 && prior) return err({ code: 'UNCHANGED', retryable: false });

  if (res.status >= 400) {
    return err({
      code: 'HTTP_ERROR',
      detail: { status: res.status },
      retryable: res.status === 429 || res.status >= 500,
    });
  }
  if (res.body.byteLength > MAX_BYTES) {
    return err({ code: 'TOO_LARGE', detail: { bytes: res.body.byteLength }, retryable: false });
  }

  const contentType = (res.headers['content-type'] ?? 'application/octet-stream').split(';')[0]!.trim();
  const isText = /^(text\/|application\/(json|xml|xhtml))/.test(contentType);
  const body = isText ? new TextDecoder('utf-8').decode(res.body) : Buffer.from(res.body).toString('base64');

  const artifact: RawArtifact = {
    rawId: rawId({ sourceId: args.sourceId, locator, body }),
    sourceId: args.sourceId,
    locator,
    fetchedAt: args.now,
    contentType,
    httpStatus: res.status,
    body,
    encoding: isText ? 'utf-8' : 'base64',
    byteSize: res.body.byteLength,
    validators: {
      ...(res.headers.etag ? { etag: res.headers.etag } : {}),
      ...(res.headers['last-modified'] ? { lastModified: res.headers['last-modified'] } : {}),
    },
  };

  await args.store.put(artifact);
  return ok(artifact);
};
