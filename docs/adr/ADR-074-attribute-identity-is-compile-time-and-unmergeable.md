# ADR-074: Attribute identity is compile-time, and duplicate definitions are refused

## Status
Accepted (Session 032)

## Context
Ontology packs are meant to compose: a core camera pack, a professional pack, a
regional pack. The obvious composition rule is that later packs override
earlier ones, or that identical definitions merge silently.

Both are unsafe here, because an attribute definition carries more than a name.
It carries a unit, a direction, a JND and a plausible range — and every one of
those feeds a different downstream subsystem. If two packs define `weight_g`
with JND 5 and JND 15, then conflict detection (ADR-061) behaves differently
depending on load order, adjudication queues fill or empty accordingly, and the
resulting decisions differ with no versioned dimension recording why. That is a
determinism violation (ADR-068) manufactured at compile time.

"Identical definitions merge" is barely better: it makes the packs' equality
semantics depend on structural comparison of floating-point fields, and it
means a one-character change to a rationale silently becomes a hard error later.

## Decision
1. Duplicate `attributeId` across packs is a compile error. Packs namespace
   their ids. There is no override, no merge, no last-writer-wins.
2. Numeric attributes must declare a JND. Compilation refuses without one,
   because the alternative default — treat any difference as significant —
   converts every rounding discrepancy between two spec sheets into an
   adjudicable conflict and drowns the reviewer queue in noise.
3. Units come from a closed registry with dimensions. An unknown unit is an
   error; a cross-dimension conversion is an error.
4. Requirements must state a rationale, and so must each profile's emphasis
   assignment. A weight with no stated reason cannot be reviewed, and the
   calibration review step assumes it can be.
5. A profile whose total emphasis is zero is an error rather than a profile
   that ranks nothing.
6. All diagnostics are collected and thrown together. A pack author fixes the
   whole pack in one pass instead of one error per build.

## Consequences
- Composing third-party packs requires coordination on namespaces, which is
  friction that pays for load-order independence.
- `ontologyFingerprint` is derived from the sorted list of per-pack
  fingerprints plus `modelRef`, so it is stable under declaration reordering
  and changes whenever any pack's content changes. This closes the upstream
  requirement noted in Session 019.
Copy