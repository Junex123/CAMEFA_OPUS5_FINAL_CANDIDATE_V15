export interface ReviewerOutcome {
  reviewerId: string;
  conflictId: string;
  /** True when the reviewer's pick matched the independent anchor. */
  agreedWithAnchor: boolean | null;
  /** True when it matched the eventual consensus of other reviewers. */
  agreedWithConsensus: boolean | null;
}

export interface ReviewerCalibration {
  reviewerId: string;
  /** Cohen's kappa against anchors — the only trustworthy figure. */
  kappaAnchored: number | null;
  anchoredN: number;
  kappaConsensus: number | null;
  consensusN: number;
  band: 'high' | 'medium' | 'low' | 'unrated';
  /** Anchored and consensus scores diverge — reviewer follows the crowd. */
  herding: boolean;
}

const MIN_ANCHORED_N = 8;
const HERDING_GAP = 0.25;

function kappa(agreements: number, total: number, chance = 0.5): number | null {
  if (total === 0) return null;
  const observed = agreements / total;
  return (observed - chance) / (1 - chance);
}

/**
 * Kappa is split (ADR-066). Consensus agreement measures how well a reviewer
 * matches other reviewers, which under a shared wrong prior rewards being
 * wrong in the same direction as everyone else. Only anchored kappa is used to
 * band a reviewer; consensus kappa exists to detect herding.
 */
export function calibrateReviewers(
  outcomes: readonly ReviewerOutcome[],
): ReviewerCalibration[] {
  const byReviewer = new Map<string, ReviewerOutcome[]>();
  for (const o of outcomes) {
    const list = byReviewer.get(o.reviewerId) ?? [];
    list.push(o);
    byReviewer.set(o.reviewerId, list);
  }

  return [...byReviewer.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reviewerId, rows]) => {
      const anchored = rows.filter((r) => r.agreedWithAnchor !== null);
      const consensus = rows.filter((r) => r.agreedWithConsensus !== null);

      const kAnchored = kappa(
        anchored.filter((r) => r.agreedWithAnchor === true).length,
        anchored.length,
      );
      const kConsensus = kappa(
        consensus.filter((r) => r.agreedWithConsensus === true).length,
        consensus.length,
      );

      const band: ReviewerCalibration['band'] =
        kAnchored === null || anchored.length < MIN_ANCHORED_N
          ? 'unrated'
          : kAnchored >= 0.75
            ? 'high'
            : kAnchored >= 0.5
              ? 'medium'
              : 'low';

      return {
        reviewerId,
        kappaAnchored: kAnchored,
        anchoredN: anchored.length,
        kappaConsensus: kConsensus,
        consensusN: consensus.length,
        band,
        herding:
          kAnchored !== null &&
          kConsensus !== null &&
          anchored.length >= MIN_ANCHORED_N &&
          kConsensus - kAnchored > HERDING_GAP,
      };
    });
}

export function pseudonymOf(reviewerId: string, salt: string): string {
  let h = 2166136261;
  const text = `${salt}:${reviewerId}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `reviewer-${(h >>> 0).toString(16).padStart(8, '0').slice(0, 4)}`;
}
