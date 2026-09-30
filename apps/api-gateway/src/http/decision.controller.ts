import { Body, Controller, Inject, Post, Res, UsePipes } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  normalizedRequestSchema,
  type DecisionEngineClient,
  type DecisionRequest,
} from '@camefa/engine-contracts';
import { ENGINE } from '../engine/engine.module.js';
import { PrismaReceiptSink } from '../engine/adapters/prisma-receipt-sink.js';
import { ZodPipe } from './zod.pipe.js';
import { ContractException } from './contract-error.filter.js';

@Controller('v1')
export class DecisionController {
  constructor(
    @Inject(ENGINE) private readonly engine: DecisionEngineClient,
    private readonly receipts: PrismaReceiptSink,
  ) {}

  @Post('evaluate')
  @UsePipes(new ZodPipe(normalizedRequestSchema))
  async evaluate(
    @Body() input: DecisionRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    try {
      const receipt = await this.engine.evaluate(input);
      await this.receipts.put(receipt, receipt.lineage);

      response.header('x-camefa-receipt', receipt.receiptId);
      response.header('x-camefa-work-units', String(receipt.cost.evidenceReads + receipt.cost.derivations + receipt.cost.scoringPasses));
      response.header('cache-control', 'public, max-age=31536000, immutable');

      return { data: receipt.decision, meta: { receiptId: receipt.receiptId, versions: receipt.versions } };
    } catch (error) {
      throw new ContractException({
        code: 'INTERNAL',
        message: error instanceof Error ? error.message : 'engine evaluation failed',
        retryable: error instanceof Error && error.name === 'BudgetExhaustedError',
      });
    }
  }
}
