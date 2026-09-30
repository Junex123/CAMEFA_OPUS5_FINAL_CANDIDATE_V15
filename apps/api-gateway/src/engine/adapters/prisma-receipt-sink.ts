import { Injectable } from '@nestjs/common';
import {
  canonicalHash,
  receiptSlug,
  verifyAddress,
  type DecisionReceipt,
  type ReceiptSinkPort,
} from '@camefa/engine-contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

const MAX_LINEAGE_BYTES = 1_048_576;

@Injectable()
export class PrismaReceiptSink implements ReceiptSinkPort {
  constructor(private readonly prisma: PrismaService) {}

  async put(receipt: DecisionReceipt, lineage: unknown): Promise<void> {
    const { cost, ...payload } = receipt;
    const serialized = JSON.stringify(lineage ?? null);
    const byteSize = Buffer.byteLength(serialized);
    const storedLineage = byteSize > MAX_LINEAGE_BYTES
      ? { truncated: true, byteSize }
      : JSON.parse(serialized);

    await this.prisma.decisionReceipt.upsert({
      where: { receiptId: receipt.receiptId },
      update: {
        evaluation: {
          upsert: {
            update: {
              asOf: new Date(receipt.sealedAt),
              cost: cost as object,
              determinism: 'deterministic',
              warnings: [],
              actorKind: 'redacted',
            },
            create: {
              primitive: 'evaluate',
              asOf: new Date(receipt.sealedAt),
              cost: cost as object,
              determinism: 'deterministic',
              warnings: [],
              actorKind: 'redacted',
            },
          },
        },
      },
      create: {
        receiptId: receipt.receiptId,
        slug: receiptSlug(receipt),
        schema: receipt.schema,
        sealedAt: new Date(receipt.sealedAt),
        epoch: receipt.epoch as object,
        versions: receipt.versions as object,
        request: receipt.request as object,
        decision: receipt.decision as object,
        coverage: receipt.coverage as object,
        fragility: receipt.fragility as object | null | undefined,
        inputDigest: canonicalHash(receipt.request),
        outputDigest: canonicalHash(receipt.decision),
        lineageDigest: canonicalHash(receipt.lineage),
        evaluation: {
          create: {
            primitive: 'evaluate',
            asOf: new Date(receipt.sealedAt),
            cost: cost as object,
            determinism: 'deterministic',
            warnings: [],
            actorKind: 'redacted',
          },
        },
        lineage: {
          create: {
            payload: storedLineage as object,
            byteSize,
          },
        },
      },
    });
  }

  async get(receiptId: string): Promise<DecisionReceipt | null> {
    const row = await this.prisma.decisionReceipt.findUnique({
      where: { receiptId },
      include: { evaluation: true },
    });
    if (!row?.evaluation) return null;

    const receipt = {
      ...(row.payload as object),
      receiptId: row.receiptId,
      sealedAt: row.sealedAt.toISOString(),
      cost: row.evaluation.cost,
    } as unknown as DecisionReceipt;

    return verifyAddress(receipt) ? receipt : null;
  }
}
