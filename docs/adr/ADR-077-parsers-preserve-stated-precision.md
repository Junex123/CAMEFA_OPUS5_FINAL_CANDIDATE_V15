# ADR-077: Parsers preserve the precision the source stated

## Status
Accepted (Session 034)

## Context
Two manufacturer pages give a body weight as "670 g" and "670.4 g". A third
says "approx. 700 g". Conflict detection (ADR-061) compares numbers against a
JND, and on the numbers alone the first two agree and the third disagrees.

But the three statements have different epistemic status. "670 g" is a rounded
figure that is consistent with anything from 669.5 to 670.5. "670.4 g" is a
measurement. "approx. 700 g" is an admission of imprecision. A parser that
returns bare `number` throws all of that away, and then two consequences follow.

First, spurious conflicts. A source stating 670 and one stating 670.4 will be
flagged as disagreeing whenever the JND is below 0.4, and a reviewer spends
twelve minutes discovering the two sources agree to within their stated
precision. Multiplied across a corpus this is most of the adjudication queue.

Second, and worse, missed conflicts in the other direction. Rounding hides real
disagreement: two sources both stating "670 g" may have measured 669.6 and
670.4, and we record them as identical.

## Decision
1. `parseNumeric` returns value, unit, the count of digits after the decimal
   point in the source text, and an `approximate` flag set when the source
   hedged ("approx", "about", "~", "±", or a range).
2. Hedged values are flagged `source_approximate` at parse time. The flag
   travels with the claim, so adjudication can weigh a hedged claim against a
   precise one without re-reading the source.
3. Units are normalised through a closed alias table, and an unrecognised unit
   is a parse failure rather than a passthrough. A unit string that reaches the
   graph unrecognised becomes a silent conversion error at scoring time.
4. Parsers never drop a field they recognised but could not interpret. Those go
   to `unparsed` with the verbatim text and a reason, so a parser regression
   shows up as a coverage drop with a diagnosis attached rather than as claims
   that quietly stopped appearing.
5. Every claim retains `rawText`. When a systematic offset is detected in a
   stratum (ADR-072), the verbatim text is what makes the bug findable.
6. Parsers are pure functions of the stored raw capture, so any parser
   improvement can be replayed over history without refetching. This is the
   whole reason the raw store exists and is why raw capture and promotion are
   separate gates (ADR-071).

## Consequences
- Claim records carry more fields than a value. Storage cost is trivial next to
  the reviewer time saved by not adjudicating rounding.
- Precision is not yet used by conflict detection — this ADR makes it
  *available*. The follow-up is to widen the effective JND by the coarser of
  the two sources' stated precisions, which should cut the conflict queue
  substantially. That change alters which conflicts exist and therefore which
  decisions have contested slots, so it must land as its own single-dimension
  change with its own diff.
- The alias table is a chokepoint that will need extending for every new source
  family. That is intended: adding a unit is a deliberate act with a test.
Copy