import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { ConflictReadService } from './conflict-read.service.js';
import { projectConflict, type PublicConflict } from './conflict-public.projection.js';

@Controller('v1/conflicts')
export class ConflictPublicController {
  constructor(private readonly reads: ConflictReadService) {}

  @Get(':conflictId')
  @Header('cache-control', 'public, max-age=30, stale-while-revalidate=300')
  async one(@Param('conflictId') conflictId: string): Promise<PublicConflict> {
    const found = await this.reads.load(conflictId);
    if (!found) throw new NotFoundException({ code: 'conflict_not_found', conflictId });
    return projectConflict(found.record, found.claims, found.affectedDecisions);
  }
}
