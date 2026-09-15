import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  assessBlindSpots,
  commit,
  DEFAULT_PLAN_POLICY,
  planAnchorBatch,
  reveal,
  type AnchorPlan,
  type AnchorTicket,
  type BlindSpotReport,
  type MeasurementSubmission,
  type Reveal,
} from '@camefa/engine-adjudication';
import { AnchorRepository } from './anchor.repository.js';
import { principalOf } from '../auth/principal.js';

const TICKET_TTL_MS = 72 * 60 * 60 * 1000;

@Controller('v1/anchors')
export class AnchorController {
  constructor(private readonly repo: AnchorRepository) {}

  @Get('plan')
  async plan(@Query('budget') budget?: string): Promise<AnchorPlan> {
    const candidates = await this.repo.candidates();
    return planAnchorBatch(candidates, {
      ...DEFAULT_PLAN_POLICY,
      budgetMinutes: Number(budget ?? DEFAULT_PLAN_POLICY.budgetMinutes),
    });
  }

  @Post('plan/:planId/tickets')
  async issue(@Param('planId') planId: string): Promise<AnchorTicket[]> {
    const plan = await this.repo.planById(planId);
    const tickets: AnchorTicket[] = [];

    for (const slot of [...plan.targeted, ...plan.exploratory]) {
      const ticketId = randomUUID();
      const predicted = await this.repo.currentEngineValue(slot.slotKey);
      const salt = randomBytes(16).toString('hex');
      const meta = await this.repo.slotMeta(slot.slotKey);

      const ticket: AnchorTicket = {
        ticketId,
        planId,
        slotKey: slot.slotKey,
        entityId: slot.entityId,
        entityLabel: slot.entityLabel,
        attribute: slot.attribute,
        unit: meta.unit,
        selection: slot.selection,
        protocol: meta.protocol,
        jnd: meta.jnd,
        commitment: commit({ ticketId, predicted, salt }),
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TICKET_TTL_MS).toISOString(),
      };

      // Prediction is stored in a separate table the reviewer role cannot read.
      await this.repo.sealPrediction({ ticketId, predicted, salt });
      await this.repo.saveTicket(ticket);
      tickets.push(ticket);
    }
    return tickets;
  }

  @Post(':ticketId/measure')
  async measure(
    @Param('ticketId') ticketId: string,
    @Body() body: Omit<MeasurementSubmission, 'ticketId' | 'measuredBy'>,
    @Req() req: Request,
  ): Promise<Reveal> {
    const ticket = await this.repo.ticket(ticketId);
    const sealed = await this.repo.prediction(ticketId);
    const submission: MeasurementSubmission = {
      ...body,
      ticketId,
      measuredBy: principalOf(req as never).subjectId,
    };

    // Measurement lands first, atomically, so the reveal cannot influence it.
    await this.repo.recordMeasurement(submission);
    const result = reveal(ticket, sealed, submission);
    await this.repo.recordOutcome({
      slotKey: ticket.slotKey,
      stratum: await this.repo.stratumOf(ticket.slotKey),
      selection: ticket.selection,
      absError: result.absError,
      signedError: result.signedError,
      jnd: result.jnd,
      surprising: result.surprising,
    });
    return result;
  }

  @Get('blind-spots')
  async blindSpots(): Promise<BlindSpotReport> {
    return assessBlindSpots(await this.repo.outcomes());
  }
}
