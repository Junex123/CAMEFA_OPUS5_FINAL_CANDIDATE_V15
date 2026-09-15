import { type Result, ok, err } from './result.js';
import type { Brand } from './brand.js';

export type CurrencyCode = Brand<string, 'CurrencyCode'>;
export const currency = (s: string): CurrencyCode => s.toUpperCase() as CurrencyCode;

/** Integer minor units. Never floats — binary floats cannot represent 0.10 exactly. */
export interface Money {
  readonly minor: number;
  readonly currency: CurrencyCode;
  readonly exponent: number;
}

export type MoneyError =
  | { readonly code: 'CURRENCY_MISMATCH'; readonly a: CurrencyCode; readonly b: CurrencyCode }
  | { readonly code: 'RATE_REQUIRED'; readonly from: CurrencyCode; readonly to: CurrencyCode }
  | { readonly code: 'NOT_INTEGER_MINOR'; readonly minor: number };

export const money = (minor: number, code: CurrencyCode, exponent = 2): Result<Money, MoneyError> =>
  Number.isSafeInteger(minor)
    ? ok({ minor, currency: code, exponent })
    : err({ code: 'NOT_INTEGER_MINOR', minor });

export const addMoney = (a: Money, b: Money): Result<Money, MoneyError> =>
  a.currency !== b.currency || a.exponent !== b.exponent
    ? err({ code: 'CURRENCY_MISMATCH', a: a.currency, b: b.currency })
    : ok({ ...a, minor: a.minor + b.minor });

export const compareMoney = (a: Money, b: Money): Result<-1 | 0 | 1, MoneyError> => {
  if (a.currency !== b.currency) return err({ code: 'CURRENCY_MISMATCH', a: a.currency, b: b.currency });
  const d = a.minor * Math.pow(10, -a.exponent) - b.minor * Math.pow(10, -b.exponent);
  return ok(d < 0 ? -1 : d > 0 ? 1 : 0);
};

export interface FxRate {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
  readonly rate: number;
  readonly observedAt: string;
}

export const convertMoney = (m: Money, to: CurrencyCode, rate: FxRate | null): Result<Money, MoneyError> => {
  if (m.currency === to) return ok(m);
  if (!rate || rate.from !== m.currency || rate.to !== to) {
    return err({ code: 'RATE_REQUIRED', from: m.currency, to });
  }
  return ok({ minor: Math.round(m.minor * rate.rate), currency: to, exponent: m.exponent });
};
