import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { costScalar, type ActorRef, type CostVector, type RateLimiterPort } from '@camefa/engine-contracts';

const BUCKETS: Record<ActorRef['kind'], { capacity: number; refillPerMs: number }> = {
  anonymous: { capacity: 50_000, refillPerMs: 50_000 / 3_600_000 },
  user: { capacity: 1_000_000, refillPerMs: 1_000_000 / 3_600_000 },
  service: { capacity: 20_000_000, refillPerMs: 20_000_000 / 3_600_000 },
};

const TAKE = `
local s = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens, ts = tonumber(s[1]), tonumber(s[2])
local cap, refill, now, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
if tokens == nil then tokens = cap; ts = now end
tokens = math.min(cap, tokens + (now - ts) * refill)
local allowed, retry = 0, 0
if tokens >= cost then tokens = tokens - cost; allowed = 1
else retry = math.ceil((cost - tokens) / refill) end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / refill) + 60000)
return { allowed, retry }
`;

// Refund/charge the delta between reservation and actual spend.
const RECONCILE = `
local s = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens, ts = tonumber(s[1]), tonumber(s[2])
local cap, refill, now, delta = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
if tokens == nil then tokens = cap; ts = now end
tokens = math.max(0, math.min(cap, tokens + (now - ts) * refill - delta))
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / refill) + 60000)
return 1
`;

@Injectable()
export class RedisRateLimiter implements RateLimiterPort {
  private readonly reservations = new Map<string, number>();

  constructor(private readonly redis: Redis) {
    this.redis.defineCommand('camefaTake', { numberOfKeys: 1, lua: TAKE });
    this.redis.defineCommand('camefaReconcile', { numberOfKeys: 1, lua: RECONCILE });
  }

  async admit(actor: ActorRef, estimatedUnits: number, nowMs: number) {
    const b = BUCKETS[actor.kind];
    const key = `rl:${actor.kind}:${actor.id}`;
    const [allowed, retry] = (await (this.redis as any).camefaTake(
      key, b.capacity, b.refillPerMs, nowMs, estimatedUnits,
    )) as [number, number];

    if (allowed !== 1) return { admitted: false as const, retryAfterMs: Math.max(retry, 250) };

    const reservationId = `${key}:${nowMs}:${Math.random().toString(36).slice(2, 10)}`;
    this.reservations.set(reservationId, estimatedUnits);
    return { admitted: true as const, reservationId };
  }

  async settle(actor: ActorRef, reservationId: string, actual: CostVector, nowMs: number) {
    const reserved = this.reservations.get(reservationId) ?? 0;
    this.reservations.delete(reservationId);
    const delta = costScalar(actual) - reserved; // negative => refund
    if (delta === 0) return;
    const b = BUCKETS[actor.kind];
    await (this.redis as any).camefaReconcile(
      `rl:${actor.kind}:${actor.id}`, b.capacity, b.refillPerMs, nowMs, delta,
    );
  }
}
