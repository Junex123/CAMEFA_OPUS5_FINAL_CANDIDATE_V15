import { Inject, Module, type Provider } from '@nestjs/common';
import type { Engine } from '@camefa/engine-runtime';
import { createEngine } from '@camefa/engine-runtime';
import type { CostBudget } from '@camefa/engine-contracts';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaClaimResolver } from './adapters/prisma-claim-resolver.js';
import { PrismaReceiptSink } from './adapters/prisma-receipt-sink.js';
import { PackStore } from './adapters/pack-store.js';
import { OtelTelemetry } from './adapters/otel-telemetry.js';

export const ENGINE = Symbol.for('camefa.engine');

const DEFAULT_BUDGET: CostBudget = {
  evidenceReads: 600,
  derivations: 400,
  scoringPasses: 2000,
  wallClockMs: 2000,
  fragility: {
    evidenceReads: 120,
    derivations: 80,
    scoringPasses: 400,
    wallClockMs: 400,
  },
};

const requiredEnv = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value.length === 0) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
};

const engineProvider: Provider = {
  provide: ENGINE,
  inject: [PackStore, PrismaClaimResolver],
  useFactory: async (packs: PackStore, claims: PrismaClaimResolver): Promise<Engine> =>
    createEngine({
      ontologySource: await packs.loadPacks(),
      derivations: await packs.loadDerivations(),
      claims,
      budget: DEFAULT_BUDGET,
      now: () => new Date().toISOString(),
      buildFingerprint: requiredEnv('BUILD_FINGERPRINT'),
      defaultEntityType: 'gear.capture.body',
    }),
};

@Module({
  imports: [PrismaModule],
  providers: [
    PackStore,
    PrismaClaimResolver,
    PrismaReceiptSink,
    OtelTelemetry,
    engineProvider,
  ],
  exports: [ENGINE, PrismaReceiptSink, PrismaService],
})
export class EngineModule {}

export type CamefaEngine = Engine;
export const injectEngine = () => Inject(ENGINE);
