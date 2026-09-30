import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { EngineModule } from './engine/engine.module.js';
import { DecisionController } from './http/decision.controller.js';
import { DecisionStreamController } from './decision/decision-stream.controller.js';
import { ReceiptController } from './http/receipt.controller.js';
import { ReceiptDiffController } from './receipt/receipt-diff.controller.js';
import { ReceiptReadService } from './receipt/receipt-read.service.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, EngineModule],
  controllers: [DecisionController, DecisionStreamController, ReceiptController, ReceiptDiffController],
  providers: [ReceiptReadService],
})
export class AppModule {}
