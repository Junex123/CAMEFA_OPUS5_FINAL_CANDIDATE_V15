export interface AnchorPlan {
  readonly planId: string;
  readonly spentMinutes: number;
  readonly budgetMinutes: number;
  readonly targeted: readonly unknown[];
  readonly exploratory: readonly unknown[];
  readonly skippedInfeasible: number;
}

export interface BlindSpots {
  readonly underPowered: boolean;
  readonly blindSpot: boolean;
  readonly narrative: string;
  readonly byStratum: readonly unknown[];
}

export async function fetchPlan(_budget?: string): Promise<AnchorPlan> {
  return { planId: 'unconfigured', spentMinutes: 0, budgetMinutes: 0, targeted: [], exploratory: [], skippedInfeasible: 0 };
}

export async function fetchBlindSpots(): Promise<BlindSpots> {
  return { underPowered: true, blindSpot: false, narrative: 'Anchor service is not configured in this build.', byStratum: [] };
}
