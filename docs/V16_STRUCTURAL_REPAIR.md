# CAMEFA Opus 5 — V16 Structural Repair

This archive reconciles the V15 repository around the newer `createEngine()` / `DecisionEngineClient` architecture. It is a structural repair, not a claim that the production data layer is complete.

## Canonical path

`DecisionRequest -> createEngine -> ontology compilation -> capability graph -> CapabilityRunner -> Evaluator -> ranking -> DecisionReceipt -> sealReceipt`.

The gateway now injects the runtime engine through a symbol token instead of constructing the legacy `EngineClient` facade. The old `EngineProvider`, duplicated gateway port files, and the legacy primitive controller path are removed from the active application module.

## Main repairs

- Added the missing reasoning decision orchestrator (`evaluateDecision` and `evaluateDecisionStream`).
- Connected `engine-runtime` to the current capability/reasoning interfaces and removed the obsolete ingest `ClaimReader` dependency.
- Added canonical `LineageNode` ownership in contracts and aligned capability/reasoning lineage construction to it.
- Added `entityType` to the normalized request contract so runtime entity resolution is explicit.
- Reworked gateway persistence to retain the complete canonical `DecisionReceipt` in the existing JSON storage field while keeping legacy scalar columns populated for indexing compatibility.
- Added a deterministic static photography ontology/derivation `PackStore`.
- Added a fail-closed Prisma claim resolver because the current Prisma schema does not contain a claim ledger. No product evidence is fabricated.
- Renamed the evaluation-layer `Severity` to `FindingSeverity` to separate it from contract diagnostic severity.
- Fixed capability saturation handling to use the capability definition's `saturation` field.
- Fixed candidate unit validation to compare physical dimensions with the ontology.
- Added the runtime assembly regression test and refreshed receipt/contract tests that referenced removed legacy types.
- Expanded `verify-graph` so it handles package roots without manifests and can inspect `src`, `test`, and `app` surfaces.

## Intentionally unresolved

- The repository still contains legacy tests/fixtures from earlier contract generations that need a dedicated migration pass.
- The S046 fixture migration kit (`migrate-fixtures`, `codemod-receipt`, and receipt test builder) is not present in the source archive.
- ADR-079 through ADR-085 are not present in the historical ADR directory.
- The current Prisma schema has no authoritative claim ledger, so API evaluation through the gateway will fail closed to unknown/partial coverage until one is provided.
- `BUILD_FINGERPRINT` is intentionally required by the gateway engine provider; receipts must not silently fall back to a non-identifying build label.
- Full `pnpm install`, typecheck, test, and production build were not executed in the repair workspace because dependencies are not installed and the environment could not retrieve them from the network. Changed TypeScript files were syntax/transpile checked.

## Validation performed in the repair workspace

- JSON parsing of root, gateway, and runtime package manifests: passed.
- TypeScript syntax/transpile check of 24 changed TypeScript files: passed.
- The graph verifier was updated, but its final repository-wide semantic result still depends on the legacy test surface and available dependency graph.

## Naming

Archive name: `CAMEFA_OPUS5_STRUCTURAL_REPAIR_V16`.
