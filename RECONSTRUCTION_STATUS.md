# CAMEFA Reconstruction Status

Historical source coverage: Sessions 001–051 plus final outputs.

## Validation state

- Static graph verifier: previously reported `verify-graph: 14 packages OK` on the prior candidate.
- Turbo build: prior candidate was blocked by a cyclic workspace dependency involving contracts, ontology, capability, reasoning, and testkit.
- Repair pass V2: removed production-facing dependency edges from `engine-testkit` back into capability/reasoning. Testkit now depends only on kernel and uses structural test interfaces, eliminating the workspace cycle without weakening production package direction.
- V2 has not yet been validated by a Windows pnpm/Turbo build. It must not be described as build-clean until that validation succeeds.

## V16 structural-repair checkpoint

- Migrated the API gateway off the non-constructable legacy `EngineClient` facade and onto a symbol-injected `createEngine()` provider.
- Added static photography/core-unit pack loading and a fail-closed Prisma claim resolver because the surviving Prisma schema has no authoritative claim ledger.
- Added the runtime decision orchestration and aligned canonical receipt/lineage surfaces.
- Added `REPAIR_MANIFEST_V16.json` and `docs/V16_STRUCTURAL_REPAIR.md` documenting known unresolved migration work.
- Changed TypeScript sources were syntax/transpile checked; full pnpm typecheck/test/build remains pending in an environment with dependencies installed.

## V17 type-fix checkpoint

- Confirmed the surviving V16 branch had no `ClaimReader`, `ReasoningConfig`, or `ImputationPolicy` declarations despite `createEngine` importing them.
- Canonicalized claims to the existing `ClaimResolverPort` consumed by `CapabilityRunner`.
- Added explicit reasoning and imputation configuration to the reasoning package; the defaults are now part of the reasoning fingerprint and `defaultEntityType` lives inside reasoning configuration rather than as a stray runtime dependency.
- Removed the unused fallback parameter from the gateway's fail-loud environment helper.
- Normalized the canonical Result failure shape so `diagnostics` is always an array of `Diagnostic` values.
- Full dependency-backed pnpm verification remains pending.
