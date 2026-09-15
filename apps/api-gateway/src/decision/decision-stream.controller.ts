import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { CostDimension } from '@camefa/engine-kernel';
import { EngineClient, type EvaluateRequest } from '@camefa/engine-contracts';
import { RateLimiterPort } from '../ports/rate-limiter.port.js';
import { ReceiptSinkPort } from '../ports/receipt-sink.port.js';
import { EngineProvider } from '../engine/engine.provider.js';
import { principalOf } from '../auth/principal.js';

type Frame =
  | { t: 'open'; streamId: string; engine: unknown }
  | { t: 'stage'; name: string; at: number }
  | { t: 'partial'; path: string; value: unknown }
  | { t: 'cost'; dim: CostDimension; spent: number; budget: number }
  | { t: 'receipt'; receiptId: string; replayable: boolean }
  | { t: 'error'; code: string; message: string }
  | { t: 'done'; ms: number };

@Controller('v1/decisions')
export class DecisionStreamController {
  constructor(
    private readonly engines: EngineProvider,
    private readonly limiter: RateLimiterPort,
    private readonly receipts: ReceiptSinkPort,
  ) {}

  @Post('evaluate/stream')
  async stream(
    @Body() body: EvaluateRequest,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const principal = principalOf(req);
    const streamId = randomUUID();
    const t0 = Date.now();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (f: Frame) => {
      if (res.writableEnded) return;
      res.write(`event: ${f.t}\ndata: ${JSON.stringify(f)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 15_000);

    const admission = await this.limiter.admit({
      principal,
      estimate: EngineClient.estimate('evaluate', body),
    });

    if (!admission.ok) {
      send({ t: 'error', code: 'rate_limited', message: admission.reason });
      clearInterval(heartbeat);
      res.end();
      return;
    }

    const spent = new Map<CostDimension, number>();
    const engine = this.engines.for(body.ontologyRef);

    send({ t: 'open', streamId, engine: engine.version });

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    try {
      const outcome = await engine.evaluate(body, {
        signal: abort.signal,
        onStage: (name) => send({ t: 'stage', name, at: Date.now() - t0 }),
        onPartial: (path, value) => send({ t: 'partial', path, value }),
        onCost: (dim, delta) => {
          const next = (spent.get(dim) ?? 0) + delta;
          spent.set(dim, next);
          send({
            t: 'cost',
            dim,
            spent: next,
            budget: admission.budget[dim] ?? 0,
          });
        },
      });

      const receipt = await this.receipts.persist(outcome.receipt);
      send({
        t: 'receipt',
        receiptId: receipt.receiptId,
        replayable: receipt.replayable,
      });
      send({ t: 'done', ms: Date.now() - t0 });
    } catch (err) {
      const e = err as Error & { code?: string };
      send({
        t: 'error',
        code: e.code ?? 'engine_error',
        message: e.message ?? 'unknown',
      });
    } finally {
      await this.limiter.settle({
        principal,
        reservationId: admission.reservationId,
        actual: Object.fromEntries(spent) as Record<CostDimension, number>,
      });
      clearInterval(heartbeat);
      res.end();
    }
  }
}
