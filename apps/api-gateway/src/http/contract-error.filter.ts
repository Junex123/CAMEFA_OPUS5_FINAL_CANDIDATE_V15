import { Catch, ExceptionFilter, ArgumentsHost, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ContractError, ContractErrorCode } from '@camefa/engine-contracts';

const STATUS: Record<ContractErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNKNOWN_PRIMITIVE: 404,
  PACK_VERSION_NOT_FOUND: 404,
  INFEASIBLE: 422,
  BUDGET_EXCEEDED: 422,
  RATE_LIMITED: 429,
  ONTOLOGY_UNAVAILABLE: 503,
  RESOLVER_FAILURE: 503,
  CITATION_VIOLATION: 500,
  INTERNAL: 500,
};

export class ContractException extends Error {
  constructor(readonly error: ContractError) { super(error.message); }
}

@Catch(ContractException)
export class ContractErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('Engine');

  catch(ex: ContractException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    const e = ex.error;
    const status = STATUS[e.code] ?? 500;

    if (status >= 500) this.log.error(`${e.code}: ${e.message}`, JSON.stringify(e.detail ?? {}));

    if (e.retryAfterMs !== undefined) res.header('retry-after', Math.ceil(e.retryAfterMs / 1000));

    res.status(status).send({
      error: { code: e.code, message: e.message, retryable: e.retryable, ...(e.detail ? { detail: e.detail } : {}) },
    });
  }
}
