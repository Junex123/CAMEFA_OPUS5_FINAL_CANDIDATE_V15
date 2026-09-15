import { assertPathAllowed, type SourceDescriptor } from '../sources/registry.js';

export interface RobotsGate {
  allowed(url: string, userAgent: string): Promise<boolean>;
}

export interface FetchOutcome {
  url: string;
  status: number;
  body: Uint8Array | null;
  etag: string | null;
  fetchedAt: string;
  skipped: 'robots' | 'not_modified' | null;
}

const USER_AGENT =
  'camefa-ingest/1.0 (+https://camefa.app/crawler; contact@camefa.app)';

/** Per-origin serialisation; crawl delay is honoured even across retries. */
class Pacer {
  private next = 0;
  constructor(private readonly delayMs: number) {}
  async wait(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.delayMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

export class PoliteFetcher {
  private readonly pacers = new Map<string, Pacer>();

  constructor(
    private readonly robots: RobotsGate,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private pacer(source: SourceDescriptor): Pacer {
    let p = this.pacers.get(source.sourceId);
    if (!p) {
      p = new Pacer(source.crawlDelayMs);
      this.pacers.set(source.sourceId, p);
    }
    return p;
  }

  async get(
    source: SourceDescriptor,
    url: string,
    knownEtag: string | null,
  ): Promise<FetchOutcome> {
    assertPathAllowed(source, url);

    if (!(await this.robots.allowed(url, USER_AGENT))) {
      return {
        url,
        status: 0,
        body: null,
        etag: null,
        fetchedAt: this.now().toISOString(),
        skipped: 'robots',
      };
    }

    await this.pacer(source).wait();

    const res = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/json;q=0.9,*/*;q=0.5',
        ...(knownEtag ? { 'if-none-match': knownEtag } : {}),
      },
      redirect: 'follow',
    });

    if (res.status === 304) {
      return {
        url,
        status: 304,
        body: null,
        etag: knownEtag,
        fetchedAt: this.now().toISOString(),
        skipped: 'not_modified',
      };
    }

    return {
      url,
      status: res.status,
      body: res.ok ? new Uint8Array(await res.arrayBuffer()) : null,
      etag: res.headers.get('etag'),
      fetchedAt: this.now().toISOString(),
      skipped: null,
    };
  }
}
