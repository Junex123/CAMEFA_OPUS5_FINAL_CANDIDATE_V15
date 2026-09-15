import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { RequestContext } from '@camefa/engine-contracts';
import type { CurrencyCode } from '@camefa/engine-kernel';

const SUPPORTED_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD']);

@Injectable()
export class RequestContextFactory {
  /** The gateway is the *only* place a clock is read. */
  build(req: FastifyRequest): RequestContext {
    const auth = req.principal; // set by AuthGuard; null for public traffic
    const header = (k: string) => (req.headers[k] as string | undefined)?.trim() || undefined;

    const currency = (header('x-camefa-currency') ?? 'USD').toUpperCase();
    const asOf = header('x-camefa-as-of');

    return {
      requestId: header('x-request-id') ?? randomUUID(),
      actor: auth
        ? { kind: auth.isService ? 'service' : 'user', id: auth.subjectId }
        : { kind: 'anonymous', id: req.anonymousFingerprint },
      now: new Date().toISOString(),
      ...(asOf && !Number.isNaN(Date.parse(asOf)) ? { asOf: new Date(asOf).toISOString() } : {}),
      locale: (header('accept-language')?.split(',')[0] ?? 'en-US'),
      currency: (SUPPORTED_CURRENCIES.has(currency) ? currency : 'USD') as CurrencyCode,
      ...(parsePins(header('x-camefa-ontology'))),
      allowModel: header('x-camefa-prose') !== 'off' && auth !== null,
      flags: {},
    };
  }
}

const parsePins = (raw?: string) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return { ontologyVersions: parsed.ontology ?? {}, derivationVersions: parsed.derivation ?? {} };
  } catch {
    return {}; // malformed pins fall back to active; never fail the request on a hint header
  }
};
