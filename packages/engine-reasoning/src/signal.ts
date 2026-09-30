import type { CapabilityKey, EntityId, Quantity, Money } from '@camefa/engine-kernel';
import type { ActivityKey, RequirementTarget, Emphasis } from '@camefa/engine-ontology';
import type { RequirementId } from './requirement.js';

export type Signal =
  | { readonly kind: 'utterance'; readonly text: string; readonly locale: string }
  | { readonly kind: 'selection'; readonly capability: CapabilityKey; readonly op: 'gte' | 'lte' | 'within' | 'maximize' | 'minimize'; readonly target?: RequirementTarget; readonly emphasis: Emphasis }
  | { readonly kind: 'activity'; readonly activity: ActivityKey; readonly intensity: 'occasional' | 'regular' | 'primary' }
  | { readonly kind: 'budget'; readonly amount: Money; readonly hardness: 'blocking' | 'weighted' }
  | { readonly kind: 'kit'; readonly owned: readonly EntityId[] }
  | { readonly kind: 'exif'; readonly summary: LegacyExifSummary }
  | { readonly kind: 'correction'; readonly requirement: RequirementId; readonly action: 'drop' | 'relax' | 'harden' };

export interface LegacyExifSummary {
  readonly frameCount: number;
  readonly medianIso: number;
  readonly p90Iso: number;
  readonly fractionBelow125thSecond: number;
  readonly medianFocalLengthMm: number;
}

export type ObservedSignal = {
  readonly kind: 'observed';
  readonly source: 'exif' | 'history' | 'community' | 'profile';
  readonly capabilityKey: string;
  readonly proposal: { readonly type: 'threshold'; readonly comparator: 'gte' | 'lte' | 'within'; readonly value: Quantity } | { readonly type: 'emphasis'; readonly level: 'critical' | 'high' | 'moderate' };
  readonly confidence: number;
  readonly evidence: Readonly<Record<string, number | string>>;
};

export interface DecisionContext {
  readonly locale: string;
  readonly currency: string;
  readonly ownedKit: readonly EntityId[];
  readonly profileVersion: string;
}
