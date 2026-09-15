# ADR-068: A decision diff must attribute change, not merely display it

## Status
Accepted (Session 025)

## Context
Recalibration (ADR-051), ontology edits, reliability recomputation (ADR-058)
and adjudication outcomes (ADR-064) all move rankings. A diff that only shows
"B moved above A" invites the reader to invent a cause, and the most available
cause is usually the most recent thing the team touched — which is frequently
not the cause at all.

## Decision
1. `diffReceipts` compares five versioned dimensions: ontology fingerprint,
   model ref, calibration ref, reliability fingerprint and claim-set hash. The
   diff is labelled `attributable` only when at least one differs, and the
   changed dimensions are named in the UI banner.
2. When more than one dimension moved, the surface says the diff *cannot*
   isolate a cause and tells the reader how to get one (pin a dimension and
   re-run). It does not rank or guess among the candidate causes.
3. When the question key differs, the diff is `incomparable` and movement is
   suppressed as meaningless rather than rendered.
4. When outcomes differ and no dimension differs, the diff is
   `unattributable: determinism_violation` and is presented as a bug in the
   engine or in receipt completeness — not as a legitimate change. This is the
   test that catches an unversioned input sneaking into the pipeline.
5. Magnitude is reported with Kendall τ distance over the mutually-live
   candidate set, so "everything reshuffled slightly" and "the winner flipped"
   are distinguishable without reading the table.

## Consequences
- Any new input to the engine must either be covered by an existing dimension
  or add one; otherwise it manifests as a determinism violation on the first
  diff that crosses it. This is intentional pressure toward completeness.
- Diff URLs are content-addressed on both sides, so they are immutable and
  permanently cacheable, and can be pasted into incident reviews.
- Public conflict pages are the counterpart: they explain a contested *fact*,
  while diffs explain a changed *decision*. Lineage nodes link to the former,
  receipt footers to the latter.
Copy