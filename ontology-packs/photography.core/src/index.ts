import { packId } from '@camefa/engine-kernel';
import { emptyPack, type OntologyPack, type SemVer } from '@camefa/engine-ontology';
import { ENTITY_TYPES } from './entity-types.js';
import { ATTRIBUTES } from './attributes.js';
import { CAPABILITIES } from './capabilities.js';
import { ACTIVITIES } from './activities.js';
import { MOUNTS } from './mounts.js';

export const photographyCorePack: OntologyPack = {
  ...emptyPack(packId('photography.core'), '1.0.0' as SemVer),
  dependsOn: [packId('core.units')],
  entityTypes: ENTITY_TYPES,
  attributes: ATTRIBUTES,
  capabilities: CAPABILITIES,
  activities: ACTIVITIES,
};

export { ENTITY_TYPES } from './entity-types.js';
export { ATTRIBUTES } from './attributes.js';
export { CAPABILITIES } from './capabilities.js';
export { ACTIVITIES } from './activities.js';
export { MOUNTS } from './mounts.js';
export { WEDDING } from './activities.js';
export { photographyDerivationRegistry, PHOTOGRAPHY_DERIVATIONS } from './derivations.js';
