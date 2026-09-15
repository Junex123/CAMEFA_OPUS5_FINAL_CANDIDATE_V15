import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('v1/receipts')
export class ReceiptController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public, indexable, immutable. This is the trust surface (ADR-050). */
  @Get(':slug')
  async bySlug(@Param('slug') slug: string, @Res({ passthrough: true }) res: FastifyReply) {
    const row = await this.prisma.decisionReceipt.findUnique({
      where: { slug },
      include: { lineage: true },
    });
    if (!row) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'no such decision' } });

    res.header('cache-control', 'public, max-age=31536000, immutable');
    return {
      data: {
        receiptId: row.receiptId,
        primitive: row.primitive,
        issuedAt: row.issuedAt.toISOString(),
        asOf: row.asOf.toISOString(),
        engine: row.engine,
        digests: { input: row.inputDigest, output: row.outputDigest, lineage: row.lineageDigest },
        determinism: row.determinism,
        warnings: row.warnings,
        cost: row.cost,
        lineage: row.lineage?.payload ?? null,
      },
    };
  }
}
