# CAMEFA Reconstruction Status

Historical source coverage: Sessions 001–051 plus final outputs.

## Validation state

- Static graph verifier: previously reported `verify-graph: 14 packages OK` on the prior candidate.
- Turbo build: prior candidate was blocked by a cyclic workspace dependency involving contracts, ontology, capability, reasoning, and testkit.
- Repair pass V2: removed production-facing dependency edges from `engine-testkit` back into capability/reasoning. Testkit now depends only on kernel and uses structural test interfaces, eliminating the workspace cycle without weakening production package direction.
- V2 has not yet been validated by a Windows pnpm/Turbo build. It must not be described as build-clean until that validation succeeds.

## Important remaining work

The repository is a reconstruction candidate, not a claim of exact historical source recovery. Provisional gateway adapters and later architectural migrations still require compilation/test validation and historical tracing.

Expected old fixture migration failures under ADR-082 remain distinct from reconstruction defects.


## V4 checkpoint
- Graph verifier: PASS (`verify-graph: 14 packages OK`).
- Fixed kernel Result/cost compatibility in working tree.
- Added canonical `StreamEvent` contract and corrected client import.
- Unified request reference types with `engine-contracts/src/refs.ts`.
- Added Node typings to contracts devDependencies.
- Added missing `@camefa/engine-contracts` dependency to engine-capability.
- Full user-side Turbo build still pending; V3 is a stale checkpoint and is not final.

## Checkpoint V5
- Applied V4 compiler fixes for canonicalisation undefined indexing and Zod branded request schemas.
- Normalized Result failure branch to expose required diagnostics alongside legacy error compatibility.
- V5 remains a build candidate pending Windows Turbo verification.


## V7 checkpoint
Built from the tested V6 source. Fixes only the two V6 compiler errors in engine-contracts: canonical object-entry narrowing and normalizedRequestSchema input typing for Zod defaults. No downstream architecture changes.

## V10 checkpoint
- Based directly on tested V9.
- V9 reached engine-contracts successfully; web no longer reported the duplicate dynamic slug.
- V9 remaining build failure: engine-kernel src/cost.ts TS2540 in SoftCostScope.snapshot/addCost because Partial<CostAllowance> inherits readonly fields.
- V10 fixes only those mutable accumulator annotations to Partial<Record<CostDimension, number>>; public contract types remain readonly.
- Awaiting Windows pnpm build result before further changes.

## V11 checkpoint
- Based directly on tested V10.
- V10 passed engine-contracts, engine-kernel source compilation progressed, and web reached production compilation without the prior route conflict.
- V10 remaining blocker: engine-testkit `rule-interpreter.ts` TS2339 because a mutable local requirements accumulator was typed as a readonly contract array.
- V11 changes only that local accumulator to a mutable Array of the readonly element type.


## V12 consolidated audit checkpoint
- Consolidated compile-facing audit performed across ontology, capability, reasoning, contracts, eval, articulation, runtime, and ontology-pack entrypoints.
- V11 fixes retained; no single-error speculative patching.
- Ontology strict-indexing errors addressed.
- Root package exports and obvious cross-package missing symbols reconciled.
- Runtime final decision orchestration remains an explicit pending architecture item and was not replaced with a stub.

## V13 consolidated environment/type audit
- Based directly on V12.
- Valid V12 Windows run: verify-graph passed with 14 packages; pnpm 9.7.0; Turbo reached engine-kernel and failed only on missing `node:crypto` type declarations.
- Audited all workspace source for Node APIs/globals and package-local type visibility. Added direct `@types/node` 22.5.4 to every affected package that lacked it: engine-kernel, engine-eval, engine-articulation, engine-ingest, engine-adjudication, and web.
- No production logic changed by this pass.
