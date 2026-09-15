# ADR-069: The regression gate blocks on ground truth and budgets churn

## Status
Accepted (Session 026)

## Context
Every calibration change, ontology edit and adjudication resolution moves
rankings. The obvious gate — "fail CI if any recommendation changes" — is
unusable: it freezes the engine, because an improvement is indistinguishable
from a regression by movement alone. The equally obvious opposite — "report
movement, block nothing" — means nobody ever stops a bad calibration.

The adjudication work (ADR-066) already forced this distinction once:
consensus among reviewers is not evidence, because wrong priors reinforce
themselves. The same trap exists here. If the gate blocks on "the ranking
changed from what we shipped last week", the shipped ranking becomes ground
truth by default, and the engine can never be corrected — only made more
self-consistent.

## Decision
Two independent mechanisms, deliberately not merged:

1. **Correctness gate — blocking, unwaivable.** Golden questions may carry
   expectations with `provenance: 'anchor'`, each traceable to an independently
   verified measurement via `anchorId`. Failing one blocks the build and cannot
   be waived; a waiver excuses churn, never being wrong about a measured fact.
   Expectations with `provenance: 'editorial'` encode human judgement and are
   advisory only.

2. **Churn budget — blocking, waivable.** Winner-flip rate, Kendall τ p95 and
   elimination-flip rate are compared against thresholds. Exceeding them blocks,
   but a waiver may exclude specific questions. Waivers carry a reason, an
   approver, an expiry, and a binding to a specific `calibrationRef`; a waiver
   whose calibration has moved on is ignored and reported as stale, so waivers
   cannot silently accumulate into a permanently disabled gate.

Additional invariants:

- Determinism violations (ADR-068) and engine errors are always blocking and
  are never subject to budgets.
- Insufficient coverage is blocking: a run where most questions lacked a usable
  baseline would otherwise pass trivially, which is the failure mode where a
  broken gate looks green.
- The golden corpus is content-addressed (`fingerprint`) and fixed in the repo.
  It is never sampled from live traffic at run time, because a gate whose input
  set varies per run cannot distinguish a model change from a sampling change.
- Elimination flips get their own, much tighter budget than reorderings: under
  non-compensatory aggregation (p = -0.5) a hard-constraint verdict flipping is
  a categorical change, not a nudge.

## Consequences
- Shipping a calibration change requires either no anchored regressions, or
  fixing the model — there is no path that trades correctness for velocity.
- Growing the anchor set directly increases what the gate can catch, which
  makes anchor seeding (the adjudication console's main output) the highest-
  leverage data work in the project.
- Editorial expectations are cheap to add and never block, so they function as
  a staging area: when an editorial expectation is repeatedly right, someone
  should go measure it and promote it to an anchor.
- CI needs read access to historical receipts. Since receipts are immutable and
  content-addressed, this is a cache-friendly read-only dependency rather than
  a shared mutable fixture.
Copy