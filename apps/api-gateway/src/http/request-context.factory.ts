import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { RequestContext } from '@camefa/engine-contracts';
import type { CurrencyCode } from '@camefa/engine-kernel';

const SUPPORTED_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD']);

@Injectable()
export class RequestContextFactory {
  build(req: FastifyRequest): RequestContext {
    const auth = req.principal;
    const header = (key: string) => (req.headers[key] as string | undefined)?.trim() || undefined;
    const currency = (header('x-camefa-currency') ?? 'USD').toUpperCase();

    return {
      requestId: header('x-request-id') ?? randomUUID(),
      actor: auth
        ? { kind: auth.isService ? 'service' : 'user', id: auth.subjectId }
        : { kind: 'anonymous', id: req.anonymousFingerprint },
      now: new Date().toISOString(),
      ...(header('x-camefa-as-of') && !Number.isNaN(Date.parse(header('x-camefa-as-of')!))
        ? { asOf: new Date(header('x-camefa-as-of')!).toISOString() }
        : {}),
      locale: header('accept-language')?.split(',')[0] ?? 'en-US',
      currency: (SUPPORTED_CURRENCIES.has(currency) ? currency : 'USD') as CurrencyCode,
    };
  }
}
