import { describe, expect, it } from 'vitest';
import { commit, reveal, TicketError, type AnchorTicket } from '../src/anchor-ticket.js';

const sealed = { ticketId: 't1', predicted: 658, salt: 'abc' };
const ticket: AnchorTicket = {
  ticketId: 't1',
  planId: 'p1',
  slotKey: 'e:1|weight_g',
  entityId: 'e:1',
  entityLabel: 'E1',
  attribute: 'weight_g',
  unit: 'g',
  selection: 'targeted',
  protocol: 'Body only, no card, no battery. Scale zeroed.',
  jnd: 5,
  commitment: commit(sealed),
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-04T00:00:00.000Z',
};

const submission = (measured: number) => ({
  ticketId: 't1',
  measured,
  instrument: 'AWS-1000',
  measuredBy: 'usr:1',
  measuredAt: '2026-01-02T00:00:00.000Z',
  note: null,
});

const now = new Date('2026-01-02T00:00:00.000Z');

describe('reveal', () => {
  it('does not treat sub-JND disagreement as a surprise', () => {
    const r = reveal(ticket, sealed, submission(661), now);
    expect(r.surprising).toBe(false);
    expect(r.commitmentValid).toBe(true);
  });

  it('flags disagreement beyond the JND', () => {
    const r = reveal(ticket, sealed, submission(690), now);
    expect(r).toMatchObject({ surprising: true, signedError: 32 });
  });

  it('detects a prediction altered after issuance', () => {
    const tampered = { ...sealed, predicted: 690 };
    expect(reveal(ticket, tampered, submission(690), now).commitmentValid).toBe(false);
  });

  it('refuses an expired ticket', () => {
    expect(() =>
      reveal(ticket, sealed, submission(658), new Date('2026-02-01T00:00:00.000Z')),
    ).toThrow(TicketError);
  });

  it('refuses a mismatched or non-finite submission', () => {
    expect(() => reveal(ticket, sealed, { ...submission(1), ticketId: 't2' }, now)).toThrow(
      /does not match/,
    );
    expect(() => reveal(ticket, sealed, submission(Number.NaN), now)).toThrow(/finite/);
  });
});
