import type { PackId, UnitDefinition } from '@camefa/engine-kernel';
import type {
  SemVer, EntityTypeDefinition, AttributeDefinition,
  CapabilityDefinition, ActivityProfile,
} from './definitions.js';

export interface OntologyPack {
  readonly id: PackId;
  readonly version: SemVer;
  readonly dependsOn: readonly PackId[];
  readonly units: readonly UnitDefinition[];
  readonly entityTypes: readonly EntityTypeDefinition[];
  readonly attributes: readonly AttributeDefinition[];
  readonly capabilities: readonly CapabilityDefinition[];
  readonly activities: readonly ActivityProfile[];
}

export const emptyPack = (id: PackId, version: SemVer): OntologyPack => ({
  id, version, dependsOn: [], units: [], entityTypes: [],
  attributes: [], capabilities: [], activities: [],
});
