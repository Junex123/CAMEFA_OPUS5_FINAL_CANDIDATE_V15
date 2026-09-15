import type { EmphasisLevel } from '../calibration.js';

export type ProfileRequirement = {
  readonly capabilityKey: string;
  /** hard = gate (violation disqualifies); soft = scored. */
  readonly mode: 'hard' | 'soft';
  readonly emphasis: EmphasisLevel;
  readonly threshold?: { readonly comparator: 'gte' | 'lte'; readonly value: number; readonly unit: string };
  readonly direction?: 'maximize' | 'minimize';
  /** Above this, more stops/mm/frames stop buying real-world outcomes. */
  readonly saturationAt?: { readonly value: number; readonly unit: string };
  /** Why an expert would assert this. Rendered in explanations, never invented by a model. */
  readonly rationale: string;
};

export type ActivityProfile = {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly description: string;
  /** Profiles are the weakest signal class; anything stated or observed wins. */
  readonly precedenceClass: 'profile';
  readonly requirements: readonly ProfileRequirement[];
  /** Constraint keys from the constraint pack that this activity activates. */
  readonly constraints: readonly string[];
  readonly authoredBy: string;
  readonly reviewedAt: string;
};
