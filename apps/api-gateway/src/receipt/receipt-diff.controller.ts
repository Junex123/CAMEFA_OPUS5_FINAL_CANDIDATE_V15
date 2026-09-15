import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { diffReceipts, type ReceiptDiff } from '@camefa/engine-contracts';
import { ReceiptReadService } from './receipt-read.service.js';

@Controller('v1/receipts')
export class ReceiptDiffController {
  constructor(private readonly reads: ReceiptReadService) {}

  @Get(':a/diff/:b')
  @Header('cache-control', 'public, max-age=31536000, immutable')
  async diff(@Param('a') a: string, @Param('b') b: string): Promise<ReceiptDiff> {
    const [ra, rb] = await Promise.all([this.reads.byId(a), this.reads.byId(b)]);
    if (!ra) throw new NotFoundException({ code: 'receipt_not_found', receiptId: a });
    if (!rb) throw new NotFoundException({ code: 'receipt_not_found', receiptId: b });
    return diffReceipts(ra, rb);
  }
}
