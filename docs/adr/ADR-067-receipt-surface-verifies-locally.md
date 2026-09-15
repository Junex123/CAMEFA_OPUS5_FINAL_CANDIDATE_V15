# ADR-067: The receipt surface recomputes content addresses locally

## Status
Accepted (Session 024)

## Context
`apps/web` renders `DecisionReceipt` records fetched from the gateway, which
reads them from Postgres. If the surface trusts `receiptId` and `replayable`
as stored fields, then any corruption, migration bug, or malicious write in the
persistence layer is rendered as authoritative truth — and the whole point of
content-addressed receipts (ADR-050) is lost at exactly the moment a human
looks at one.

## Decision
1. Receipt pages recompute the content address from the payload
   (`verifyReceipt`) and render the *computed* verdict, not the stored one.
2. `replayable` is derived at read time from presence of the full version
   triplet: ontology fingerprint, model ref, calibration ref (ADR-051),
   reliability fingerprint (ADR-058). A stored/computed disagreement is shown
   explicitly rather than silently reconciled.
3. Receipt routes are `force-static` with `revalidate: false`. Immutability is
   an invariant, so caching forever is correct; a changed body would change the
   address and therefore the URL.
4. Live evaluation is a separate surface. Streams carry no authority: only the
   sealed `receipt` frame produces a citable address.

## Consequences
- Tampering is visible to the reader, not just to auditors.
- Receipt pages are cheap to serve and safe on any CDN.
- The surface must depend on the canonicalisation code from
  `@camefa/engine-contracts`; drift in canonical JSON becomes a breaking change
  for rendered receipts, so canonicalisation is now covered by cross-package
  tests.
Copy