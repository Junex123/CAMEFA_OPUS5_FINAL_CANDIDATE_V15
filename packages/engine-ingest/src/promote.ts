import { ok, type Result } from '@camefa/engine-kernel';
import { claimId } from '@camefa/engine-kernel';
import type { Claim } from '@camefa/engine-contracts';
import type { CompiledOntology } from '@camefa/engine-ontology';
import type { ParseOutput, ClaimDraft } from './parse/contract.js';
import { resolveEntity, type AliasIndexPort, type ResolutionOutcome } from './resolve.js';
import { detectOutlier } from './outlier.js';
import { scoreSource, type Adjudication } from './reliability.js';

export type QuarantineRecord = {
  readonly rawId: string;
  readonly draft: ClaimDraft;
  readonly outcome: Extract<ResolutionOutcome, { kind: 'quarantined' }>;
  readonly at: string;
};

export type PromotionReport = {
  readonly promoted: readonly Claim[];
  readonly quarantined: readonly QuarantineRecord[];
  readonly rejected: readonly { readonly draft: ClaimDraft; readonly reason: string }[];
  readonly flaggedOutliers: number;
  readonly unmappedCount: number;
};

export type CohortPort = {
  /** Existing accepted values for this attribute across the graph, for outlier context. */
  values(attributeKey: string, entityType: string): Promise<readonly number[]>;
};

const LOG_SCALED = new Set([
  'sensor.max_usable_iso',
  'capture.raw_buffer',
  'body.cipa_rating',
  'commerce.price',
  'sensor.readout_time',
]);

export const promoteDrafts = async (args: {
  parsed: ParseOutput;
  sourceId: string;
  entityType: string;
  now: string;
  ontology: CompiledOntology;
  index: AliasIndexPort;
  cohorts: CohortPort;
  adjudications: readonly Adjudication[];
  allowCreate: boolean;
}): Promise<Result<PromotionReport, never>> => {
  const promoted: Claim[] = [];
  const quarantined: QuarantineRecord[] = [];
  const rejected: { draft: ClaimDraft; reason: string }[] = [];
  let flaggedOutliers = 0;

  // Resolve each distinct source key once, not once per draft.
  const resolutions = new Map<string, ResolutionOutcome>();
  for (const key of new Set(args.parsed.drafts.map((d) => d.sourceEntityKey))) {
    resolutions.set(
      key,
      await resolveEntity({
        sourceEntityKey: key,
        entityType: args.entityType,
        sourceId: args.sourceId,
        index: args.index,
        allowCreate: args.allowCreate,
      }),
    );
  }

  for (const d of args.parsed.drafts) {
    const attribute = args.ontology.attributes.get(d.attributeKey as never);
    if (!attribute) {
      rejected.push({ draft: d, reason: `attribute not in ontology: ${d.attributeKey}` });
      continue;
    }

    // Unit compatibility is checked here, at the boundary, so no malformed
    // quantity ever enters the ledger (ADR-013).
    if (d.value.kind === 'quantity') {
      const unit = args.ontology.units.get(d.value.unit as never);
      if (!unit) {
        rejected.push({ draft: d, reason: `unknown unit: ${d.value.unit}` });
        continue;
      }
      if (attribute.valueType.kind !== 'quantity' || unit.dimension !== attribute.valueType.dimension) {
        rejected.push({
          draft: d,
          reason: `kind mismatch: ${d.value.unit} is ${unit.dimension}, ${d.attributeKey} expects ${attribute.valueType.kind === 'quantity' ? attribute.valueType.dimension : attribute.valueType.kind}`,
        });
        continue;
      }
    }

    const resolution = resolutions.get(d.sourceEntityKey)!;
    if (resolution.kind === 'quarantined') {
      quarantined.push({ rawId: args.parsed.rawId, draft: d, outcome: resolution, at: args.now });
      continue;
    }

    const reliability = scoreSource({
      sourceId: args.sourceId,
      attributeKey: d.attributeKey,
      log: args.adjudications,
      now: args.now,
    });

    let confidence = d.extractionConfidence * reliability.conservative;
    let outlierNote: string | null = null;

    if (d.value.kind === 'quantity') {
      const cohort = await args.cohorts.values(d.attributeKey, args.entityType);
      const verdict = detectOutlier(d.value.value, cohort, { log: LOG_SCALED.has(d.attributeKey) });
      if (verdict.isOutlier) {
        flaggedOutliers += 1;
        confidence *= verdict.confidenceFactor;
        outlierNote = verdict.note;
      }
    }

    const body = {
      entityId: resolution.entityId,
      attributeKey: d.attributeKey,
      value: d.value,
      validFrom: args.now,
      validTo: null,
      sourceId: args.sourceId,
      confidence: Number(Math.max(0.01, Math.min(0.99, d.extractionConfidence * (outlierNote ? 0.5 : 1))).toFixed(4)),
      provenance: {
        rawId: args.parsed.rawId,
        parserId: args.parsed.parserId,
        parserVersion: args.parsed.parserVersion,
        excerpt: d.excerpt,
        reliabilityModel: reliability.modelVersion,
        ...(outlierNote ? { outlierNote } : {}),
        ...(resolution.kind === 'matched' ? { resolvedVia: resolution.via, resolutionScore: resolution.score } : { resolvedVia: 'created' }),
      },
    };

    promoted.push({ ...body, id: claimId(body) });
  }

  return ok({
    promoted,
    quarantined,
    rejected,
    flaggedOutliers,
    unmappedCount: args.parsed.unmapped.length,
  });
};
