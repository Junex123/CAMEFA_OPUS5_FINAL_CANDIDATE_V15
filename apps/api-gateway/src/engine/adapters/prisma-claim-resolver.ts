import { Injectable } from '@nestjs/common';
import type { AttributeKey, EntityId } from '@camefa/engine-kernel';
import type { ClaimResolverPort, ResolvedClaim } from '@camefa/engine-capability';

/**
 * Compile-safe fail-closed resolver.
 *
 * V15's Prisma schema contains receipt/lineage storage but no claim ledger, so
 * pretending that a Prisma claim query exists would manufacture evidence. This
 * adapter therefore returns no claims until the claim ledger is wired in. The
 * engine consequently reports indeterminate coverage rather than inventing
 * product facts.
 */
@Injectable()
export class PrismaClaimResolver implements ClaimResolverPort {
  async resolve(
    _subject: EntityId,
    _attributes: readonly AttributeKey[],
    _opts: { readonly validAt?: string; readonly knownAt?: string; readonly policy?: string },
  ): Promise<ReadonlyMap<AttributeKey, ResolvedClaim>> {
    return new Map<AttributeKey, ResolvedClaim>();
  }
}
