# ADR-070: A decision must report how easily it could have gone the other way

## Status
Accepted (Session 027)

## Context
A ranked list with three-decimal scores reads as precision. Under the
non-compensatory aggregation this engine uses (p = -0.5), two candidates can be
separated by 0.004 — a gap that a ±5 g disagreement between two spec sheets, or
a one-notch change in an emphasis weight, would erase. Presenting that as
"#1 and #2" is a lie of format, not of arithmetic.

Two consumers need the same underlying number for different reasons. Readers
need to know whether to treat the top two as tied. The regression gate
(ADR-069) needs to know whether a winner flip is drift or breakage, because
flips on near-ties are inevitable and flips on dominated races are bugs.

## Decision
1. Every sealed receipt carries a `sensitivity` block computed *before*
   sealing, so the fragility claim is inside the content address and cannot
   drift from the decision it describes.
2. Fragility is measured as the smallest multiplier applied to any single
   requirement weight that changes the winner, expressed as |ln λ|. Bands:
   under ×1.25 is `knife_edge`, under ×2 is `sensitive`, otherwise `robust`.
   Multiplier space is used rather than additive weight deltas because weights
   are ordinal emphasis mapped to cardinal values (Session 020) and their
   absolute scale is not meaningful.
3. Search is bounded at ×8 and bisection runs a fixed 40 iterations. Both are
   determinism requirements, not performance tuning: a receipt that reports a
   different fragility on replay is a determinism violation under ADR-068.
4. `leverage` links open conflicts to the decision: for each contested slot,
   the surface reports how far the value must move to flip the recommendation
   and whether the sources already disagree by more than that. Only decisive or
   unresolved conflicts are attached, so the block stays short.
5. The gate splits winner flips by baseline fragility. Flips on `robust`
   baselines block. Flips on `knife_edge` baselines are advisory, because
   blocking them would mean freezing an ordering the evidence never supported.

## Consequences
- Adjudication gets a priority signal grounded in decision impact rather than
  claim volume: a conflict with `decisive: true` is worth a reviewer's twelve
  minutes, one without it usually is not. This supersedes the volume-weighted
  half of ADR-062's queue ordering.
- The engine now publicly admits when it cannot tell two products apart. This
  is the correct behaviour and will read as weakness to some users; the
  alternative is confident arbitrary ordering, which is worse.
- Sensitivity analysis costs O(requirements × candidates × 40) power-mean
  evaluations per decision. It is metered as its own cost dimension so it can
  be budgeted or skipped under load, at the price of a receipt that cannot
  report fragility.
- Anything that adds a requirement to a profile widens the tornado and can
  reclassify robust decisions as sensitive. That is a real finding, not noise.
Copy