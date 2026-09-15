import { Injectable } from '@nestjs/common';
import { receiptSlug, type DecisionReceipt, type ReceiptSinkPort } from '@camefa/engine-contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

const MAX_LINEAGE_BYTES = 1_048_576;

@Injectable()
export class PrismaReceiptSink implements ReceiptSinkPort {
  constructor(private readonly prisma: PrismaService) {}

  async put(receipt: DecisionReceipt, lineage: unknown): Promise<void> {
    const serialized = JSON.stringify(lineage ?? null);
    const byteSize = Buffer.byteLength(serialized);
    const stored = byteSize > MAX_LINEAGE_BYTES ? { truncated: true, byteSize } : JSON.parse(serialized);

    // Content-addressed => writes are idempotent. Identical decisions collapse.
    await this.prisma.decisionReceipt.upsert({
      where: { receiptId: receipt.receiptId },
      update: {},
      create: {
        receiptId: receipt.receiptId,
        slug: receiptSlug(receipt),
        primitive: receipt.primitive,
        issuedAt: new Date(receipt.issuedAt),
        asOf: new Date(receipt.asOf),
        engine: receipt.engine as object,
        inputDigest: receipt.inputDigest,
        outputDigest: receipt.outputDigest,
        lineageDigest: receipt.lineageDigest,
        cost: receipt.cost as object,
        determinism: receipt.determinism,
        warnings: [...receipt.warnings],
        actorKind: 'redacted',
        lineage: { create: { payload: stored as object, byteSize } },
      },
    });
  }

  async get(receiptId: string): Promise<DecisionReceipt | null> {
    const row = await this.prisma.decisionReceipt.findUnique({ where: { receiptId } });
    if (!row) return null;
    return {
      receiptId: row.receiptId,
      primitive: row.primitive as DecisionReceipt['primitive'],
      issuedAt: row.issuedAt.toISOString(),
      asOf: row.asOf.toISOString(),
      engine: row.engine as DecisionReceipt['engine'],
      inputDigest: row.inputDigest,
      outputDigest: row.outputDigest,
      lineageDigest: row.lineageDigest,
      cost: row.cost as DecisionReceipt['cost'],
      determinism: row.determinism as DecisionReceipt['determinism'],
      warnings: row.warnings,
    };
  }
}
