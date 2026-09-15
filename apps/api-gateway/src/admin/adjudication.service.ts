import { Injectable, Logger } from '@nestjs/common';
import {
  detectConflicts, prioritize, presentBlind, recordAdjudication,
  projectResolution, calibrateReviewer, nextAssignment, leaseValid,
  calibrationValidity, type Lease,
} from '@camefa/engine-adjudication';
import { ContractException } from '../http/contract-error.filter.js';
import { contractError } from '@camefa/engine-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { CachedOntologyRegistry } from '../engine/adapters/cached-ontology-registry.js';
import type { Reviewer } from './reviewer.guard.js';

@Injectable()
export class AdjudicationService {
  private readonly log = new Logger('Adjudication');

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CachedOntologyRegistry,
  ) {}

  async next(reviewer: Reviewer, now: string) {
    const [queue, state, calibration, ontology] = await Promise.all([
      this.loadQueue(),
      this.loadRoutingState(now),
      this.calibration(reviewer.id),
      this.registry.load(),
    ]);
    if (!ontology.ok) throw new ContractException(ontology.error);

    const assignment = nextAssignment({
      reviewerId: reviewer.id,
      calibration,
      queue,
      state,
      reviewerSourceIds: reviewer.affiliatedSourceIds,
      itemSourceIds: await this.itemSourceIds(queue),
      now,
    });

    if ('refused' in assignment) return { item: null, reason: assignment.refused.code };

    await this.prisma.reviewLease.create({ data: { ...assignment.lease } });

    const { item, lease } = assignment;
    if (item.kind !== 'conflict') {
      return { item: { kind: 'quarantine', lease, payload: item.payload }, reason: null };
    }

    const conflict = item.payload as ReturnType<typeof detectConflicts>[number];
    const attribute = ontology.value.attributes.get(conflict.attributeKey)!;

    return {
      item: {
        kind: 'conflict' as const,
        lease,
        presentation: presentBlind({
          conflict,
          entityLabel: await this.entityLabel(conflict.entityId),
          attributeLabel: attribute.label,
          attributeDescription: attribute.description,
          unit: attribute.canonicalUnit ?? null,
          cohort: await this.cohort(conflict.attributeKey),
        }),
        // Position in the queue is shown; priority score is not. A reviewer who
        // knows an item is high-impact may over-select the "safe" option.
        remaining: queue.length,
      },
      reason: null,
    };
  }

  async submit(reviewer: Reviewer, body: {
    leaseToken: string; itemId: string;
    verdict: Parameters<typeof recordAdjudication>[0]['verdict'];
    certainty: 1 | 2 | 3 | 4 | 5; elapsedMs: number;
  }, now: string) {
    const lease = await this.prisma.reviewLease.findFirst({
      where: { itemId: body.itemId, reviewerId: reviewer.id },
      orderBy: { grantedAt: 'desc' },
    });
    if (!leaseValid(lease as Lease | null, body.leaseToken, now)) {
      throw new ContractException(
        contractError('INVALID_REQUEST', 'lease expired; the item has been returned to the queue', {
          detail: { itemId: body.itemId },
        }),
      );
    }

    const { conflict, presentation } = await this.rehydrate(body.itemId);

    const result = recordAdjudication({
      presentation, conflict,
      reviewerId: reviewer.id, at: now,
      verdict: body.verdict, certainty: body.certainty, elapsedMs: body.elapsedMs,
      unblindReason: lease!.unblindReason ?? null,
      reviewerSourceIds: reviewer.affiliatedSourceIds,
    });
    if (!result.ok) {
      throw new ContractException(contractError('INVALID_REQUEST', result.error.code, { detail: result.error }));
    }

    // Event, agreement log, and lease release are one transaction: a partial
    // write here would either lose a verdict or double-count a source.
    await this.prisma.$transaction([
      this.prisma.adjudicationEvent.create({ data: { ...result.value.event, verdict: result.value.event.verdict as object } }),
      this.prisma.sourceAdjudication.createMany({ data: [...result.value.adjudications], skipDuplicates: true }),
      this.prisma.reviewLease.delete({ where: { leaseToken: body.leaseToken } }),
    ]);

    const events = await this.prisma.adjudicationEvent.findMany({ where: { conflictId: conflict.conflictId } });
    const projection = projectResolution(conflict, events as never);

    if (projection.status === 'resolved') {
      await this.applyResolution(projection, now);
    }

    return { accepted: true, status: projection.status, contributedToReliability: result.value.adjudications.length > 0 };
  }

  /**
   * Resolution writes a superseding assertion; it never edits or deletes the
   * losing claims. They stay queryable, and the decision that used them stays
   * replayable (ADR-021, ADR-064).
   */
  private async applyResolution(p: ReturnType<typeof projectResolution>, now: string) {
    await this.prisma.claimResolution.create({
      data: {
        conflictId: p.conflictId,
        winningClaimIds: [...p.winningClaimIds],
        supersededClaimIds: [...p.supersededClaimIds],
        decidedBy: [...p.decidedBy],
        decidedAt: p.decidedAt ?? now,
        policy: 'human_adjudication',
      },
    });
    this.log.log(`resolved ${p.conflictId} → ${p.winningClaimIds.join(',')}`);
  }

  async calibration(reviewerId: string) {
    const [events, consensus, anchors] = await Promise.all([
      this.prisma.adjudicationEvent.findMany({ where: { reviewerId } }),
      this.consensusMap(),
      this.anchorMap(),
    ]);

    const base = calibrateReviewer({ reviewerId, events: events as never, consensus, anchors });
    const overlap = events.filter((e) => consensus.has(e.conflictId)).length;
    const anchored = events.filter((e) => anchors.has(e.conflictId)).length;

    return { ...base, validity: calibrationValidity(anchored, overlap) };
  }
}
