import { Injectable, NotFoundException } from '@nestjs/common';
import { verifyAddress, type DecisionReceipt } from '@camefa/engine-contracts';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ReceiptReadService {
  constructor(private readonly prisma: PrismaService) {}

  async findAddressed(receiptId: string): Promise<DecisionReceipt> {
    const row = await this.prisma.decisionReceipt.findUnique({
      where: { receiptId },
      include: { evaluation: true },
    });
    if (!row?.evaluation) throw new NotFoundException();
    const receipt = {
      ...(row.payload as object),
      receiptId: row.receiptId,
      sealedAt: row.sealedAt.toISOString(),
      cost: row.evaluation.cost,
    } as unknown as DecisionReceipt;
    if (!verifyAddress(receipt)) throw new StoredReceiptCorruptError(receiptId);
    return receipt;
  }

  async byId(id: string): Promise<DecisionReceipt | null> {
    try { return await this.findAddressed(id); }
    catch (error) { if (error instanceof NotFoundException) return null; throw error; }
  }

  async runsFor(_receiptId: string): Promise<readonly unknown[]> { return []; }
}

export class StoredReceiptCorruptError extends Error {
  constructor(readonly receiptId: string) {
    super('stored receipt ' + receiptId + ' failed address verification');
    this.name = 'StoredReceiptCorruptError';
  }
}
