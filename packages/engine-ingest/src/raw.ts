import { contentHash, type Brand } from '@camefa/engine-kernel';

export type RawId = Brand<string, 'RawId'>;

export type RawArtifact = {
  readonly rawId: RawId;
  readonly sourceId: string;
  readonly locator: string;
  readonly fetchedAt: string;
  readonly contentType: string;
  readonly httpStatus: number;
  readonly body: string;
  readonly encoding: 'utf-8' | 'base64';
  readonly byteSize: number;
  readonly validators: { readonly etag?: string; readonly lastModified?: string };
};

export const rawId = (a: Pick<RawArtifact, 'sourceId' | 'locator' | 'body'>): RawId =>
  contentHash({ s: a.sourceId, l: a.locator, b: a.body }) as RawId;

export type RawStorePort = {
  put(a: RawArtifact): Promise<void>;
  get(id: RawId): Promise<RawArtifact | null>;
  latestFor(sourceId: string, locator: string): Promise<RawArtifact | null>;
  unparsed(sourceId: string, parserVersion: string, limit: number): Promise<readonly RawArtifact[]>;
};

/** Legacy ingest surface kept for the older unit tests. */
export interface RawCapture {
  sourceId: string;
  url: string;
  body: Uint8Array;
  etag: string | null;
  fetchedAt: string;
  runId: string;
}

export interface RawRef {
  contentHash: string;
  sourceId: string;
  url: string;
  etag: string | null;
  fetchedAt: string;
  runId: string;
  byteLength: number;
  text: string;
}

export const hashBody = (body: Uint8Array): string => `h1:${contentHash(Array.from(body))}`;
export const decodeBody = (body: Uint8Array): string => new TextDecoder('utf-8', { fatal: false }).decode(body);

export const toRef = (capture: RawCapture): RawRef => ({
  contentHash: hashBody(capture.body),
  sourceId: capture.sourceId,
  url: capture.url,
  etag: capture.etag,
  fetchedAt: capture.fetchedAt,
  runId: capture.runId,
  byteLength: capture.body.byteLength,
  text: decodeBody(capture.body),
});

export class MemoryRawStore implements RawStorePort {
  private readonly byId = new Map<RawId, RawArtifact>();
  private readonly byLocator = new Map<string, RawArtifact[]>();

  async put(a: RawArtifact): Promise<void> {
    if (!this.byId.has(a.rawId)) this.byId.set(a.rawId, a);
    const key = `${a.sourceId}|${a.locator}`;
    const list = this.byLocator.get(key) ?? [];
    list.unshift(a);
    this.byLocator.set(key, list);
  }

  async get(id: RawId): Promise<RawArtifact | null> { return this.byId.get(id) ?? null; }

  async latestFor(sourceId: string, locator: string): Promise<RawArtifact | null> {
    return this.byLocator.get(`${sourceId}|${locator}`)?.[0] ?? null;
  }

  async unparsed(_sourceId: string, _parserVersion: string, _limit: number): Promise<readonly RawArtifact[]> {
    return [];
  }

  async putLegacy(capture: RawCapture): Promise<RawRef> {
    const ref = toRef(capture);
    const artifact: RawArtifact = {
      rawId: rawId({ sourceId: ref.sourceId, locator: ref.url, body: ref.text }),
      sourceId: ref.sourceId, locator: ref.url, fetchedAt: ref.fetchedAt,
      contentType: 'text/plain', httpStatus: 200, body: ref.text, encoding: 'utf-8',
      byteSize: ref.byteLength, validators: ref.etag ? { etag: ref.etag } : {},
    };
    await this.put(artifact);
    return ref;
  }
}
