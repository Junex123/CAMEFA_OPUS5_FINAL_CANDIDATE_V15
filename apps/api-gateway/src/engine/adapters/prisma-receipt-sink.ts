import { Injectable } from '@nestjs/common';
import { canonicalHash, receiptSlug, verifyAddress, type DecisionReceipt, type ReceiptSinkPort } from '@camefa/engine-contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

const MAX_LINEAGE_BYTES = 1_048_576;

/**
 * Transitional persistence adapter for the V15 schema.
 *
 * The database model predates the canonical DecisionReceipt shape, so the full
 * receipt is stored in the existing JSON `engine` field while the scalar legacy
 * columns remain populated for indexing/backward compatibility.
 */
@Injectable()
export class PrismaReceiptSink implements ReceiptSinkPort {
  constructor(private readonly prisma: PrismaService) {}

  async put(receipt: DecisionReceipt, lineage: unknown): Promise<void> {
    const serialized = JSON.stringify(lineage ?? null);
    const byteSize = Buffer.byteLength(serialized);
    const stored = byteSize > MAX_LINEAGE_BYTES
      ? { truncated: true, byteSize }
      : JSON.parse(serialized);

    await this.prisma.decisionReceipt.upsert({
      where: { receiptId: receipt.receiptId },
      update: {},
      create: {
        receiptId: receipt.receiptId,
        slug: receiptSlug(receipt),
        primitive: 'evaluate',
        issuedAt: new Date(receipt.sealedAt),
        asOf: new Date(receipt.sealedAt),
        engine: receipt as unknown as object,
        inputDigest: canonicalHash(receipt.request),
        outputDigest: canonicalHash(receipt.decision),
        lineageDigest: canonicalHash(receipt.lineage),
        cost: receipt.cost as unknown as object,
        determinism: 'deterministic',
        warnings: [],
        actorKind: 'redacted',
        lineage: { create: { payload: stored as object, byteSize } },
      },
    });
  }

  async get(receiptId: string): Promise<DecisionReceipt | null> {
    const row = await this.prisma.decisionReceipt.findUnique({ where: { receiptId } });
    if (!row) return null;
    const receipt = row.engine as unknown as DecisionReceipt;
    return verifyAddress(receipt) ? receipt : null;
  }
}
