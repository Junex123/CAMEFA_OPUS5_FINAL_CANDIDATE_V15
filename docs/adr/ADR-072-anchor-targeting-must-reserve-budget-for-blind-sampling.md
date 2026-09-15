# ADR-072: Anchor targeting must reserve budget for blind sampling

## Status
Accepted (Session 029). Extends ADR-066, constrains ADR-062 and ADR-070.

## Context
ADR-070 gave us a way to rank measurement work by decision impact: measure the
slots where a value change would flip a recommendation. ADR-069 gave a second
ranking signal: measure the slots that would unblock anchored gate expectations.
Both are legitimate, and a plan built from them is defensibly efficient.

Both are also computed *from the engine's own beliefs*. A slot is "decisive"
because the engine's current values put two candidates close together. A slot
has "coverage gain" because the engine's ontology says that attribute matters.
So the plan measures exactly where the engine already suspects it is uncertain —
and never measures where the engine is confident. If the engine is confidently
wrong about an attribute (a parser reading grams as ounces, a spec sheet
convention misunderstood, an entity resolution that silently merged two
variants), no amount of impact-ranked measurement will ever reveal it, because
confident-wrong regions produce wide margins and therefore rank last forever.

This is the ADR-066 reliability loop in a new costume. There the failure was
consensus reinforcing wrong priors; here it is *targeting* reinforcing them.
The structure is identical: the system chooses what evidence to seek using the
beliefs that evidence is supposed to check.

## Decision
1. A fixed fraction of every measurement batch — default 30% of minutes — is
   spent on slots drawn uniformly at random, stratified across attribute
   families, with no reference to decision impact, coverage gain, dispute
   spread or any other model-derived quantity. This is not slack to be
   reclaimed when the targeted queue looks urgent; the targeted queue always
   looks urgent, which is the point.
2. The two arms are labelled on every outcome and their surprise rates are
   compared. If blind samples disagree with the engine substantially more often
   than targeted ones, the admin surface declares a targeting blind spot and
   the exploration fraction should be raised until the rates converge. Equal
   rates are the evidence that targeting is representative.
3. Measurement is blind to the engine's current value. Tickets carry a hash
   commitment to the prediction; the value is revealed only after the
   measurement is recorded. A measurement taken with the engine's answer
   visible is not independent, and promoting it to an anchor launders a model
   belief into ground truth — strictly worse than having no anchor, because the
   gate would then treat it as unwaivable truth.
4. Commitment verification failure blocks promotion to anchor and is surfaced
   as a tamper report, not a warning.
5. Per-stratum signed error is tracked separately from absolute error. A
   stratum whose errors point consistently one direction is a systematic defect
   — almost always a parser or unit-conversion bug — and must be fixed
   upstream rather than adjudicated slot by slot, which would burn reviewer
   time re-deciding the same bug hundreds of times.
6. Stratum caps prevent one attribute family from consuming the targeted
   budget, since coverage gain is lumpy and the highest-value family would
   otherwise monopolise every batch until exhausted.

## Consequences
- Measurement throughput on high-impact slots drops by the exploration
  fraction. This is a real cost paid for the ability to detect a class of error
  that is otherwise undetectable by construction.
- Blind samples will frequently confirm values nobody doubted. Reviewers will
  perceive this as wasted effort and will be tempted to skip them; the surface
  states explicitly that the judgement "this one looks unimportant" is the bias
  being controlled for. Skipped blind tickets must be recorded as skipped, not
  silently dropped, or the surprise-rate comparison is corrupted.
- Anchors now carry an independence property, not merely a provenance label, so
  ADR-069's claim that anchored expectations are unwaivable is actually earned.
- If the blind-spot signal fires, the correct response is upstream
  investigation (parsers, resolution, unit handling), not more measurement.
Copy