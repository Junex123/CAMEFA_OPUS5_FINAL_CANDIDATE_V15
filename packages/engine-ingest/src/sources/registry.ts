export type LicenceClass =
  | 'permissive'      // explicit reuse grant
  | 'factual_only'    // uncopyrightable measurements extracted, no text reuse
  | 'contract'        // negotiated feed
  | 'unclassified';   // never promotable

export type SourceKind = 'manufacturer_spec' | 'lab_measurement' | 'registry' | 'retail';

export interface SourceDescriptor {
  sourceId: string;
  kind: SourceKind;
  origin: string;
  licence: LicenceClass;
  attributionRequired: boolean;
  /** Robots + politeness are enforced by the fetcher, not by convention. */
  crawlDelayMs: number;
  maxConcurrency: number;
  /** Only these path prefixes are ever requested. */
  pathAllowlist: string[];
  parser: string;
  /** Attributes this source is entitled to assert. */
  attributeScope: string[];
  /** Prior for read-time reliability before any adjudication evidence exists. */
  reliabilityPrior: number;
  anchorEligible: boolean;
}

export class SourcePolicyError extends Error {}

/**
 * Promotion is fail-closed: an unclassified licence, an out-of-scope attribute
 * or a missing prior stops the claim at the raw store. Nothing reaches the
 * graph by default.
 */
export function assertPromotable(
  source: SourceDescriptor,
  attribute: string,
): void {
  if (source.licence === 'unclassified') {
    throw new SourcePolicyError(
      `${source.sourceId}: licence unclassified; raw capture allowed, promotion is not`,
    );
  }
  if (!source.attributeScope.includes(attribute)) {
    throw new SourcePolicyError(
      `${source.sourceId}: not in scope for attribute "${attribute}"`,
    );
  }
  if (!(source.reliabilityPrior > 0 && source.reliabilityPrior <= 1)) {
    throw new SourcePolicyError(`${source.sourceId}: invalid reliability prior`);
  }
}

export function assertPathAllowed(source: SourceDescriptor, url: string): void {
  const { pathname, origin } = new URL(url);
  if (origin !== source.origin) {
    throw new SourcePolicyError(`${source.sourceId}: cross-origin fetch ${origin}`);
  }
  if (!source.pathAllowlist.some((p) => pathname.startsWith(p))) {
    throw new SourcePolicyError(`${source.sourceId}: path ${pathname} not allowlisted`);
  }
}

export function buildRegistry(
  descriptors: readonly SourceDescriptor[],
): Map<string, SourceDescriptor> {
  const map = new Map<string, SourceDescriptor>();
  for (const d of descriptors) {
    if (map.has(d.sourceId)) {
      throw new SourcePolicyError(`duplicate sourceId ${d.sourceId}`);
    }
    map.set(d.sourceId, d);
  }
  return map;
}
