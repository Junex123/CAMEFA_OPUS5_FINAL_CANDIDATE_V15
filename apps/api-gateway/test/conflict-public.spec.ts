import { describe, expect, it } from 'vitest';
import { projectConflict } from '../src/conflict/conflict-public.projection.js';

const record = {
  conflictId: 'slot:cam-x1|weight_g|2026-Q1',
  slot: {
    entityId: 'cam-x1',
    entityLabel: 'Camera X1',
    attribute: 'weight_g',
    window: '2026-Q1',
  },
  status: 'open' as const,
  compositionHash: 'comp:9',
  anchor: null,
  jnd: { threshold: 5 },
  lease: { reviewerId: 'usr_secret', expiresAt: '2026-01-01T00:12:00.000Z' },
  resolution: null,
  openedAt: '2026-01-01T00:00:00.000Z',
};

const claims = [
  {
    claimId: 'c1',
    value: 658,
    unit: 'g',
    sourceId: 'src:manufacturer',
    reliabilityAtRead: 0.912345,
    observedAt: '2026-01-01T00:00:00.000Z',
    outlierFlags: [],
  },
];

describe('projectConflict', () => {
  it('never leaks reviewer identity or lease internals', () => {
    const out = JSON.stringify(projectConflict(record as never, claims as never, 12));
    expect(out).not.toContain('usr_secret');
    expect(out).not.toContain('lease');
  });

  it('reports a leased open conflict as in_review', () => {
    expect(projectConflict(record as never, claims as never, 12).status).toBe(
      'in_review',
    );
  });

  it('rounds read-time reliability for stable rendering', () => {
    const p = projectConflict(record as never, claims as never, 0);
    expect(p.claims[0].sourceReliability).toBe(0.912);
  });

  it('bands reviewer calibration from anchored kappa only', () => {
    const resolved = {
      ...record,
      status: 'resolved' as const,
      lease: null,
      resolution: {
        acceptedClaimIds: ['c1'],
        rejectedClaimIds: [],
        basis: 'reviewer_judgement' as const,
        publicNote: null,
        reviewerPseudonym: 'reviewer-7f3a',
        reviewerPseudonymSalt: 'nope',
        kappaAnchored: 0.81,
        kappaConsensus: 0.44,
        resolvedAt: '2026-01-02T00:00:00.000Z',
      },
    };
    const p = projectConflict(resolved as never, claims as never, 3);
    expect(p.resolution).toMatchObject({ reviewerBand: 'high', kappaAnchored: 0.81 });
    expect(JSON.stringify(p)).not.toContain('kappaConsensus');
  });
});
