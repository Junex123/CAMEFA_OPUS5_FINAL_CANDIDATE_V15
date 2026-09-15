import { Injectable } from '@nestjs/common';
import { compileOntology } from '@camefa/engine-ontology';
import { ok, err } from '@camefa/engine-kernel';
import { contractError, type OntologyRegistryPort } from '@camefa/engine-contracts';
import { PackStore } from './pack-store.js';

@Injectable()
export class CachedOntologyRegistry implements OntologyRegistryPort {
  private readonly cache = new Map<string, Awaited<ReturnType<typeof compileOntology>>>();

  constructor(private readonly store: PackStore) {}

  async load(versions?: Readonly<Record<string, string>>) {
    const pins = versions ?? (await this.store.activeVersions());
    const key = JSON.stringify(Object.entries(pins).sort());

    const hit = this.cache.get(key);
    if (hit) return hit.ok ? ok(hit.value) : err(contractError('ONTOLOGY_UNAVAILABLE', 'cached compile failure'));

    const sources = await this.store.fetch(pins);
    if (sources.missing.length > 0) {
      return err(contractError('PACK_VERSION_NOT_FOUND', 'pinned pack version does not exist', {
        detail: { missing: sources.missing },
      }));
    }

    const compiled = compileOntology(sources.packs);
    this.cache.set(key, compiled); // packs are immutable per version => cache forever
    if (!compiled.ok) {
      return err(contractError('ONTOLOGY_UNAVAILABLE', 'ontology failed to compile', {
        detail: { issues: compiled.error.issues },
      }));
    }
    return ok(compiled.value);
  }
}
