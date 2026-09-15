import { Body, Controller, Post, Req, Res, UsePipes } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { EngineClient } from '@camefa/engine-contracts';
import { isErr } from '@camefa/engine-kernel';
import { ZodPipe } from './zod.pipe.js';
import { ContractException } from './contract-error.filter.js';
import { RequestContextFactory } from './request-context.factory.js';
import { EvaluateSchema, SolveSchema, InterpretSchema, ExplainSchema, CompareSchema } from './schemas.js';

@Controller('v1')
export class DecisionController {
  constructor(
    private readonly engine: EngineClient,
    private readonly ctxFactory: RequestContextFactory,
  ) {}

  @Post('interpret')
  @UsePipes(new ZodPipe(InterpretSchema))
  interpret(@Body() input: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    return this.#dispatch('interpret', input, req, res);
  }

  @Post('evaluate')
  @UsePipes(new ZodPipe(EvaluateSchema))
  evaluate(@Body() input: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    return this.#dispatch('evaluate', input, req, res);
  }

  @Post('compare')
  @UsePipes(new ZodPipe(CompareSchema))
  compare(@Body() input: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    return this.#dispatch('compare', input, req, res);
  }

  @Post('solve')
  @UsePipes(new ZodPipe(SolveSchema))
  solve(@Body() input: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    return this.#dispatch('solve', input, req, res);
  }

  @Post('explain')
  @UsePipes(new ZodPipe(ExplainSchema))
  explain(@Body() input: unknown, @Req() req: FastifyRequest, @Res({ passthrough: true }) res: FastifyReply) {
    return this.#dispatch('explain', input, req, res);
  }

  async #dispatch(primitive: any, input: unknown, req: FastifyRequest, res: FastifyReply) {
    const context = this.ctxFactory.build(req);
    const result = await (this.engine as any)[primitive]({ primitive, input, context });

    if (isErr(result)) throw new ContractException(result.error);

    const { output, meta } = result.value;
    res.header('x-camefa-receipt', meta.receiptId);
    res.header('x-camefa-work-units', String(meta.workUnits));
    // Deterministic answers pinned to an asOf cursor can never change.
    res.header(
      'cache-control',
      meta.deterministic && context.asOf ? 'public, max-age=31536000, immutable' : 'private, no-store',
    );

    return { data: output, meta };
  }
}
