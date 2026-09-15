import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ReviewerGuard } from './reviewer.guard.js';
import { AdjudicationService } from './adjudication.service.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { SubmitSchema, SkipSchema, UnblindSchema } from './schemas.js';

@Controller('admin/v1/adjudication')
@UseGuards(ReviewerGuard)
export class AdjudicationController {
  constructor(private readonly svc: AdjudicationService) {}

  /** Returns the next item plus a lease. Never returns the same item twice. */
  @Post('next')
  next(@Req() req: FastifyRequest) {
    return this.svc.next(req.reviewer!, new Date().toISOString());
  }

  @Post('submit')
  submit(@Req() req: FastifyRequest, @Body(new ZodPipe(SubmitSchema)) body: unknown) {
    return this.svc.submit(req.reviewer!, body as never, new Date().toISOString());
  }

  @Post('skip')
  skip(@Req() req: FastifyRequest, @Body(new ZodPipe(SkipSchema)) body: unknown) {
    return this.svc.releaseLease(req.reviewer!, body as never);
  }

  /**
   * Unblinding is allowed but is a recorded, irreversible act for that item:
   * the verdict stops contributing to source reliability.
   */
  @Post('unblind')
  unblind(@Req() req: FastifyRequest, @Body(new ZodPipe(UnblindSchema)) body: unknown) {
    return this.svc.unblind(req.reviewer!, body as never, new Date().toISOString());
  }

  @Get('me')
  me(@Req() req: FastifyRequest) {
    return this.svc.calibration(req.reviewer!.id);
  }

  @Get('queue/stats')
  stats() {
    return this.svc.queueStats();
  }
}
