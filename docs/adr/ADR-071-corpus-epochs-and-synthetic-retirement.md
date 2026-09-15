# ADR-071: Corpus epochs, and why synthetic seeds cannot be deleted quietly

## Status
Accepted (Session 028)

## Context
The 31 synthetic entities from Session 020 were never data; they were fixtures
that let the reasoning layer be built test-first. But they have since been
referenced from outside the graph: golden questions name them, anchors are
seeded against them, and profile documentation cites them as examples. They
have quietly become part of the specification.

Two failures were waiting here. First, deleting the seeds and inserting real
entities changes every entity id, so golden questions would start asserting
things about entities that no longer exist — and `checkExpectations` reports an
absent entity as a *failed expectation*, not as a broken test. A hundred silent
false regressions look identical to a hundred real ones. Second, even with ids
correctly aliased, every claim value changes at once, so `diffReceipts` labels
the entire run "attributable to claimSetHash" and the churn budget (ADR-069)
fails the build for a reason that has nothing to do with the change under
review.

## Decision
1. **Corpus epoch.** Each ingestion run emits a `corpusEpoch` derived from the
   promoted claim set. Baseline receipts record the epoch they were sealed
   under. `epochGuard` makes cross-epoch comparison *incomparable*, not
   *failing-with-churn*: the gate suppresses all churn budgets, keeps anchor
   and engine-error checks active, and instructs the operator to re-baseline.
   Measuring a corpus swap tells you nothing about a calibration change.
2. **Retirement is a plan, not a delete.** `planRetirement` requires an
   explicit synthetic→real alias map and refuses to be `safe` while any
   referenced synthetic is unmapped, or while its real replacement lacks the
   attributes the reference depends on. Unreferenced synthetics may simply be
   dropped.
3. **Promotion is fail-closed on provenance.** A source may be crawled and
   stored raw under any licence classification, but only `permissive`,
   `factual_only` or `contract` sources can promote claims into the graph, and
   only for attributes in their declared scope. Raw capture and promotion are
   deliberately separate gates, because the raw store's value is that parsers
   can be re-run over it later — including under a licence classification that
   changes.
4. **Coverage is corroboration-weighted.** An attribute counts as covered when
   an entity has any claim, and as corroborated only with two *distinct*
   sources. Repeat claims from one source are volume, not evidence.
5. **Anchor eligibility is a source property.** Only lab-measurement and
   registry sources can seed anchors, preserving the ADR-066 separation between
   independently verified ground truth and consensus.

## Consequences
- The first real ingestion run is necessarily a re-baselining event. This is
  correct and should be done as its own change, with no calibration or ontology
  edits riding along, so the next diff has exactly one moving dimension.
- The engine's regression gate is temporarily reduced to anchor checks only,
  until baselines are re-sealed. Anchor coverage is therefore the binding
  constraint on how safe the swap is — which is the same conclusion Session 026
  reached from the other direction.
- Nightly ingestion aborts on a 20% failure rate rather than importing a
  partial corpus, because a partial corpus produces a new epoch and invalidates
  baselines just as thoroughly as a complete one.
- Manufacturer specs are treated as `factual_only`: measurements are extracted,
  marketing prose is not stored beyond the raw capture, and attribution is
  retained on every promoted claim.
Copy