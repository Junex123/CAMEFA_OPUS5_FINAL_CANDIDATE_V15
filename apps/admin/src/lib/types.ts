export type ReviewReason = 'EMPTY' | 'REVIEWER_FLAGGED' | string;

export interface ConflictOption {
  readonly optionToken: string;
  readonly label: string;
  readonly value: unknown;
  readonly supportCount: number;
  readonly excerpt?: string | null;
}

export interface ConflictPresentation {
  readonly conflictId: string;
  readonly entityLabel: string;
  readonly attributeLabel: string;
  readonly attributeDescription: string;
  readonly unit?: string;
  readonly cohortSummary?: unknown;
  readonly options: readonly ConflictOption[];
}

export interface ConflictItem {
  readonly kind: 'conflict';
  readonly presentation: ConflictPresentation;
  readonly lease: { readonly leaseToken: string };
}

export interface NextReviewItem {
  readonly item: ConflictItem;
  readonly reason?: ReviewReason;
}

export interface QueueEmptyResult {
  readonly item: null;
  readonly reason: ReviewReason;
}
