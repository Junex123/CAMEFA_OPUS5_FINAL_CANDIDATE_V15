# ADR-076: Absent evidence is neither zero nor free

## Status
Accepted (Session 033)

## Context
Real corpora are ragged. A camera body will have a price everywhere, a measured
dynamic range from one lab, and a flash sync speed nobody bothered to publish.
Scoring has to do something when a profile requirement has no value for a
candidate, and both obvious answers are seriously wrong.

**Score it as zero.** Under the non-compensatory aggregation (p = -0.5) a
single zero term floors the whole aggregate. So any candidate missing one spec
scores zero and ranks below every documented candidate regardless of merit.
The engine would be eliminating by ignorance and presenting it as judgement,
and — worse — the ranking would then be a map of our data coverage rather than
of the products.

**Skip the term and renormalise over what is present.** This is the one that
looks reasonable and is actually dangerous. A candidate with three of five
requirements documented gets scored only on those three. If the missing two are
its weaknesses — which is exactly when a manufacturer omits a number — the gap
raises its score. Poor coverage becomes a competitive advantage, and any
adversarial or merely lazy source can climb the rankings by publishing less.
That is an incentive gradient pointing directly away from the thing the whole
engine exists to do.

## Decision
Three mechanisms, layered.

1. **Hard requirements are never imputed.** No evidence for the attribute
   behind a hard requirement means the candidate is *excluded*, not eliminated
   and not scored, with an explicit reason in `outcome.excluded`. Exclusion and
   elimination are kept distinct: elimination is a claim about the product
   ("costs too much"), exclusion is a claim about our data ("we don't know what
   it costs"). Conflating them would let a coverage gap read as a product
   defect.

2. **A weighted coverage floor.** A candidate must have observed values backing
   at least 60% of soft requirement *weight* — weight, not attribute count, so
   missing one `critical` requirement is not offset by having three
   `nice_to_have` ones. Below the floor the candidate is excluded, because a
   score built mostly from imputation is not a judgement about that product.

3. **Pessimistic imputation above the floor.** Remaining gaps are filled with
   the worst value observed among admissible candidates for that attribute,
   respecting the attribute's direction. This removes the incentive entirely:
   withholding a number gets you treated as the worst known, so there is never
   a reason to prefer silence. The imputation is marked in the lineage tree as
   an explicit node, and imputed weight discounts the candidate's confidence
   proportionally, so a partly-imputed score cannot present as well-supported.

Additionally, term contribution is computed leave-one-out rather than as a
share of the weighted sum. Under p < 0 a term's share of the sum is not its
influence on the result, and a weak term's true contribution is *negative* —
the aggregate improves without it. Reporting shares would tell readers a term
helped when it hurt.

## Consequences
- Thin candidates disappear from rankings rather than appearing badly ranked.
  Users will sometimes ask why a product they know about is absent; the answer
  is in `outcome.excluded` and should be surfaced, not hidden.
- Imputation makes a candidate's score depend on the *other* candidates in the
  comparison, since the floor is drawn from the observed population. This is a
  real coupling and it means a score is only meaningful within its receipt. It
  is also why `claimSetHash` is a version dimension: change the candidate set
  and the imputation floors move, which must show up as attributable churn
  (ADR-068) rather than as mystery drift.
- Coverage becomes directly visible as ranking eligibility, which gives
  ingestion a clear target: raise weighted coverage above the floor for the
  candidates users actually ask about.
- The 60% floor is a calibration parameter and belongs in the calibration
  document, not in code, once calibration review lands.
Copy