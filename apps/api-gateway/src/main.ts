import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module.js';
import { ContractErrorFilter } from './http/contract-error.filter.js';

const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 512 * 1024, trustProxy: true, genReqId: () => crypto.randomUUID() }),
  );

  await app.register(helmet);
  app.useGlobalFilters(new ContractErrorFilter());
  app.enableShutdownHooks();

  await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' });
};

void bootstrap();
