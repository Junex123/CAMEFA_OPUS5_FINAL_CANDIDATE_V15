import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { EngineClient, type EnginePorts } from '@camefa/engine-contracts';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaClaimResolver } from './adapters/prisma-claim-resolver.js';
import { PrismaReceiptSink } from './adapters/prisma-receipt-sink.js';
import { CachedOntologyRegistry } from './adapters/cached-ontology-registry.js';
import { PrismaActivityProfiles } from './adapters/prisma-activity-profiles.js';
import { RedisRateLimiter } from './adapters/redis-rate-limiter.js';
import { OtelTelemetry } from './adapters/otel-telemetry.js';
import { AnthropicArticulator } from './adapters/anthropic-articulator.js';
import { PackStore } from './adapters/pack-store.js';

@Module({
  imports: [PrismaModule],
  providers: [
    PackStore,
    PrismaClaimResolver,
    PrismaReceiptSink,
    CachedOntologyRegistry,
    PrismaActivityProfiles,
    OtelTelemetry,
    { provide: Redis, useFactory: () => new Redis(process.env.REDIS_URL!) },
    { provide: RedisRateLimiter, useFactory: (r: Redis) => new RedisRateLimiter(r), inject: [Redis] },
    {
      provide: AnthropicArticulator,
      useFactory: () => (process.env.ARTICULATOR_API_KEY ? new AnthropicArticulator() : null),
    },
    {
      provide: EngineClient,
      inject: [PrismaClaimResolver, CachedOntologyRegistry, PrismaActivityProfiles,
               AnthropicArticulator, PrismaReceiptSink, RedisRateLimiter, OtelTelemetry],
      useFactory: (claims, ontology, profiles, articulator, receipts, limiter, telemetry): EngineClient =>
        new EngineClient({ claims, ontology, profiles, articulator, receipts, limiter, telemetry } satisfies EnginePorts),
    },
  ],
  exports: [EngineClient, PrismaService],
})
export class EngineModule {}
