import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { verifyAddress, type DecisionReceipt } from '@camefa/engine-contracts';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('v1/receipts')
export class ReceiptController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':slug')
  async bySlug(@Param('slug') slug: string, @Res({ passthrough: true }) response: FastifyReply) {
    const row = await this.prisma.decisionReceipt.findUnique({
      where: { slug },
      include: { evaluation: true, lineage: true },
    });
    if (!row?.evaluation) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'no such decision' } });

    const receipt = {
      ...(row.payload as object),
      receiptId: row.receiptId,
      sealedAt: row.sealedAt.toISOString(),
      cost: row.evaluation.cost,
    } as unknown as DecisionReceipt;
    if (!verifyAddress(receipt)) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'no such decision' } });

    response.header('cache-control', 'public, max-age=31536000, immutable');
    return { data: receipt, lineage: row.lineage?.payload ?? receipt.lineage };
  }
}
