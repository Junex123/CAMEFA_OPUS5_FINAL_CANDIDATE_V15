import type { CapabilityCachePort } from './ports.js';

export class MemoryCapabilityCache implements CapabilityCachePort {
  readonly #map = new Map<string, unknown>();
  #hits = 0;
  #misses = 0;

  async get(key: string): Promise<unknown | undefined> {
    const v = this.#map.get(key);
    if (v === undefined) this.#misses += 1;
    else this.#hits += 1;
    return v;
  }

  async set(key: string, value: unknown): Promise<void> {
    if (key !== '') this.#map.set(key, value);
  }

  stats() {
    return { hits: this.#hits, misses: this.#misses, size: this.#map.size };
  }
}
