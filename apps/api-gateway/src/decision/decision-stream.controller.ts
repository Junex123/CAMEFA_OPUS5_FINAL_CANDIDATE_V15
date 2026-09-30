import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { DecisionEngineClient, DecisionRequest, StreamEvent } from '@camefa/engine-contracts';
import { normalizedRequestSchema } from '@camefa/engine-contracts';
import { ENGINE } from '../engine/engine.module.js';
import { ZodPipe } from '../http/zod.pipe.js';
import { PrismaReceiptSink } from '../engine/adapters/prisma-receipt-sink.js';

@Controller('v1/decisions')
export class DecisionStreamController {
  constructor(
    @Inject(ENGINE) private readonly engine: DecisionEngineClient,
    private readonly receipts: PrismaReceiptSink,
  ) {}

  @Post('evaluate/stream')
  async stream(
    @Body(new ZodPipe(normalizedRequestSchema)) body: DecisionRequest,
    @Req() _request: FastifyRequest,
    @Res() response: FastifyReply,
  ): Promise<void> {
    const raw = response.raw;
    response.raw.statusCode = 200;
    response.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    response.raw.setHeader('Connection', 'keep-alive');
    response.raw.setHeader('X-Accel-Buffering', 'no');
    raw.flushHeaders?.();

    try {
      for await (const event of this.engine.evaluateStream(body)) {
        if (event.type === 'sealed') await this.receipts.put(event.receipt, event.receipt.lineage);
        writeEvent(raw, event);
      }
    } catch (error) {
      writeEvent(raw, {
        type: 'error',
        message: error instanceof Error ? error.message : 'engine stream failed',
      });
    } finally {
      raw.end();
    }
  }
}

const writeEvent = (response: ServerResponse, event: StreamEvent): void => {
  if (response.writableEnded) return;
  response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
};
