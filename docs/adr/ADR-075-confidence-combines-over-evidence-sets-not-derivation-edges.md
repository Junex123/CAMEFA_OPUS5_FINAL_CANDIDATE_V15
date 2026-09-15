# ADR-075: Confidence combines over evidence sets, not along derivation edges

## Status
Accepted (Session 032)

## Context
Derived attributes form a DAG, not a tree. `low_light_stops` depends on sensor
dynamic range and lens aperture; a later requirement may depend on both
`low_light_stops` and on dynamic range directly. So the same underlying claim
reaches a scoring term by more than one path.

The natural implementation propagates a scalar confidence along each edge and
multiplies at each join. It is wrong in a way that is hard to notice: a claim
that fans out and rejoins gets its uncertainty counted twice, so the more
thoroughly an attribute is used, the less confident the engine becomes about
it. Confidence would then depend on the *shape of the derivation graph* rather
than on the evidence, and refactoring a derivation pack into smaller steps
would silently lower confidence across the board.

## Decision
1. Every derived value carries the transitive set of `EvidenceRef`s it was
   computed from, keyed by `claimId`. Union is set union, so fan-in is
   idempotent.
2. Confidence is computed once, at the end, from that set — never incrementally
   along edges. Since the input is a set, graph shape cannot affect the result.
3. Within an attribute slot, distinct sources corroborate:
   `1 - Π(1 - reliability)`. Repeat claims from the same source contribute the
   maximum of their reliabilities, not a product, because volume from one source
   is not independent evidence (ADR-071).
4. Across slots, confidence is the weakest link. A derivation is only as
   trustworthy as its worst-supported input, matching the non-compensatory
   posture of the aggregation itself (ADR-047).
5. Evidence closure covers inputs the derivation actually read, not all inputs
   it declared. An optional input the derivation ignored must not lower
   confidence in the result.

## Consequences
- Receipts carry more data: the evidence closure per derived value rather than
  a scalar. This is what makes the lineage tree and the leverage analysis
  (ADR-070) possible, so the cost is already being paid for elsewhere.
- Reliability is read at evaluation time (ADR-058), so the same derivation over
  the same claims yields different confidence after recalibration. This is
  intended, and is why `reliabilityFingerprint` is a version dimension.
- Splitting or merging derivations changes cost and lineage depth but not
  confidence. Derivation packs can be refactored freely.
Copy