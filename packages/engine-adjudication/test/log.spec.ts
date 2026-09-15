import { describe, expect, it } from 'vitest';
import {
  assertDisjoint,
  currentResolution,
  LogError,
  sealEvent,
  verifyChain,
  type AdjudicationEvent,
} from '../src/log.js';

const draft = (over: Partial<Omit<AdjudicationEvent, 'eventId' | 'chainHash'>> = {}) => ({
  conflictId: 'slot:e:1|weight_g|2026-Q1',
  compositionHash: 'comp:1',
  reviewerId: 'usr:1',
  acceptedClaimIds: ['c:1'],
  rejectedClaimIds: ['c:2'],
  basis: 'reviewer_judgement' as const,
  publicNote: null,
  privateNote: null,
  decidedAt: '2026-02-01T00:00:00.000Z',
  previousEventId: null,
  ...over,
});

describe('sealEvent', () => {
  it('is deterministic and order-independent over claim ids', () => {
    const a = sealEvent(draft({ acceptedClaimIds: ['c:1', 'c:3'] }), null);
    const b = sealEvent(draft({ acceptedClaimIds: ['c:3', 'c:1'] }), null);
    expect(a.eventId).toBe(b.eventId);
  });

  it('changes identity when the decision changes', () => {
    expect(sealEvent(draft(), null).eventId).not.toBe(
      sealEvent(draft({ acceptedClaimIds: ['c:2'], rejectedClaimIds: ['c:1'] }), null).eventId,
    );
  });
});

describe('verifyChain', () => {
  const first = sealEvent(draft(), null);
  const second = sealEvent(
    draft({
      previousEventId: first.eventId,
      acceptedClaimIds: ['c:2'],
      rejectedClaimIds: ['c:1'],
      basis: 'anchor_measurement',
      decidedAt: '2026-03-01T00:00:00.000Z',
    }),
    first.chainHash,
  );

  it('accepts a well-formed chain including a reversal', () => {
    expect(verifyChain([first, second])).toEqual({ valid: true, brokenAt: null });
  });

  it('detects a tampered event body', () => {
    const forged = { ...second, acceptedClaimIds: ['c:9'] };
    expect(verifyChain([first, forged]).valid).toBe(false);
  });

  it('detects a removed event', () => {
    expect(verifyChain([second]).valid).toBe(false);
  });

  it('detects reordering', () => {
    expect(verifyChain([second, first]).valid).toBe(false);
  });

  it('treats an empty log as valid', () => {
    expect(verifyChain([])).toEqual({ valid: true, brokenAt: null });
  });
});

describe('currentResolution', () => {
  it('returns the latest event so a reversal supersedes', () => {
    const first = sealEvent(draft(), null);
    const second = sealEvent(draft({ previousEventId: first.eventId, basis: 'escalation' }), first.chainHash);
    expect(currentResolution([first, second])?.basis).toBe('escalation');
  });
});

describe('assertDisjoint', () => {
  it('refuses a claim both accepted and rejected', () => {
    expect(() => assertDisjoint(['c:1'], ['c:1'])).toThrow(LogError);
  });

  it('refuses a resolution accepting nothing', () => {
    expect(() => assertDisjoint([], ['c:1'])).toThrow(/at least one claim/);
  });
});
