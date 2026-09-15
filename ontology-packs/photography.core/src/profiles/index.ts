import { contentHash } from '@camefa/engine-kernel';
import type { ActivityProfile } from './types.js';
import { weddingDocumentary } from './wedding.documentary.js';
import { wildlifeBirds } from './wildlife.birds.js';
import { travelLight } from './travel.light.js';

export const PROFILES: readonly ActivityProfile[] = [
  travelLight,
  weddingDocumentary,
  wildlifeBirds,
].sort((a, b) => (a.id < b.id ? -1 : 1));

export const PROFILE_INDEX: ReadonlyMap<string, ActivityProfile> = new Map(
  PROFILES.map((p) => [p.id, p]),
);

export const profilesFingerprint = (): string => contentHash(PROFILES);

export type { ActivityProfile, ProfileRequirement } from './types.js';
