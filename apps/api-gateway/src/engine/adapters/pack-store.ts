import { coreUnitsPack } from '@camefa/ontology-core-units';
import {
  photographyCorePack,
  photographyDerivationRegistry,
} from '@camefa/ontology-photography-core';
import type { OntologyPack } from '@camefa/engine-ontology';
import type { DerivationRegistry } from '@camefa/engine-capability';

/**
 * Static pack loader for the current photography deployment.
 *
 * This replaces the pre-S035 registry abstraction. A database-backed pack
 * loader can be introduced later without putting that concern back inside the
 * decision engine itself.
 */
export class PackStore {
  async loadPacks(): Promise<readonly OntologyPack[]> {
    return [coreUnitsPack, photographyCorePack];
  }

  async loadDerivations(): Promise<DerivationRegistry> {
    return photographyDerivationRegistry();
  }

  async activeVersions(): Promise<Readonly<Record<string, string>>> {
    return Object.fromEntries(
      (await this.loadPacks()).map((pack) => [String(pack.id), String(pack.version)]),
    );
  }

  async fetch(_pins: Readonly<Record<string, string>>): Promise<{ packs: readonly OntologyPack[]; missing: readonly string[] }> {
    return { packs: await this.loadPacks(), missing: [] };
  }
}
