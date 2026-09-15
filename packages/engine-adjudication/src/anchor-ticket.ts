import { canonicalHash } from '@camefa/engine-contracts';

export interface AnchorTicket {
  ticketId: string;
  planId: string;
  slotKey: string;
  entityId: string;
  entityLabel: string;
  attribute: string;
  unit: string | null;
  selection: 'targeted' | 'exploratory';
  protocol: string;
  jnd: number;
  /** Commitment to the engine's current value; the measurer never sees it. */
  commitment: string;
  issuedAt: string;
  expiresAt: string;
}

export interface SealedPrediction {
  ticketId: string;
  predicted: number;
  salt: string;
}

export interface MeasurementSubmission {
  ticketId: string;
  measured: number;
  instrument: string;
  measuredBy: string;
  measuredAt: string;
  note: string | null;
}

export interface Reveal {
  ticketId: string;
  predicted: number;
  measured: number;
  absError: number;
  signedError: number;
  jnd: number;
  surprising: boolean;
  commitmentValid: boolean;
}

export class TicketError extends Error {}

export function commit(p: SealedPrediction): string {
  return canonicalHash({ ticketId: p.ticketId, predicted: p.predicted, salt: p.salt });
}

/**
 * The engine's current value is committed to but withheld until the
 * measurement is submitted. Showing it first turns an independent measurement
 * into a confirmation exercise, and an anchor that agrees because the measurer
 * saw the answer is worse than no anchor: it launders a model belief into
 * ground truth and defeats the ADR-066 split.
 */
export function reveal(
  ticket: AnchorTicket,
  sealed: SealedPrediction,
  submission: MeasurementSubmission,
  now: Date = new Date(),
): Reveal {
  if (submission.ticketId !== ticket.ticketId) {
    throw new TicketError('submission does not match ticket');
  }
  if (new Date(ticket.expiresAt).getTime() <= now.getTime()) {
    throw new TicketError(`ticket ${ticket.ticketId} expired at ${ticket.expiresAt}`);
  }
  if (!Number.isFinite(submission.measured)) {
    throw new TicketError('measured value is not finite');
  }

  const signedError = submission.measured - sealed.predicted;
  return {
    ticketId: ticket.ticketId,
    predicted: sealed.predicted,
    measured: submission.measured,
    absError: Math.abs(signedError),
    signedError,
    jnd: ticket.jnd,
    // Below the just-noticeable difference the disagreement cannot change any
    // decision, so it is not a surprise (ADR-061).
    surprising: Math.abs(signedError) > ticket.jnd,
    commitmentValid: commit(sealed) === ticket.commitment,
  };
}
