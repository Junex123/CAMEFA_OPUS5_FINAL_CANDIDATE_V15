import type { Emphasis } from '@camefa/engine-contracts';

export interface ProfileRequirement {
  requirementId: string;
  emphasis: Emphasis;
  rationale: string;
}

export interface ActivityProfile {
  profileId: string;
  label: string;
  requirements: ProfileRequirement[];
  /** Entity types this profile can rank. */
  appliesTo: string[];
}
