import { entityTypeKey } from '@camefa/engine-kernel';
import type { EntityTypeDefinition } from '@camefa/engine-ontology';

const t = entityTypeKey;

export const ENTITY_TYPES: readonly EntityTypeDefinition[] = [
  { key: t('gear'), label: 'Gear', abstract: true },
  { key: t('gear.capture'), label: 'Capture device', extends: t('gear'), abstract: true },
  { key: t('gear.capture.body'), label: 'Camera body', extends: t('gear.capture'), abstract: false },
  { key: t('gear.optic'), label: 'Optic', extends: t('gear'), abstract: true },
  { key: t('gear.optic.lens'), label: 'Lens', extends: t('gear.optic'), abstract: false },
  { key: t('gear.optic.adapter'), label: 'Mount adapter', extends: t('gear.optic'), abstract: false },
  { key: t('gear.media'), label: 'Recording media', extends: t('gear'), abstract: false },
  { key: t('gear.power'), label: 'Power source', extends: t('gear'), abstract: false },
  { key: t('gear.support'), label: 'Support', extends: t('gear'), abstract: false },
  { key: t('gear.light'), label: 'Lighting', extends: t('gear'), abstract: false },
  { key: t('gear.audio'), label: 'Audio', extends: t('gear'), abstract: false },
  { key: t('gear.compute'), label: 'Editing machine', extends: t('gear'), abstract: false },
];

export const MOUNTS = [
  'sony.e', 'canon.rf', 'canon.ef', 'nikon.z', 'nikon.f',
  'l.alliance', 'mft', 'fuji.x', 'fuji.g', 'pentax.k',
] as const;
