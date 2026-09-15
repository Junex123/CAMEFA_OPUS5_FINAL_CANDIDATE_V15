# ADR-078: Conflict tolerance derives from stated precision, not from the ontology JND alone

## Status
Accepted (Session 035). Completes the follow-up left open by ADR-077.

## Context
ADR-061 defined conflicts as disagreement exceeding an attribute's
just-noticeable difference — the smallest change that could alter a decision.
For `weight_g` that is around 5 g. ADR-077 then made parsers preserve the
precision each source stated.

Putting those together exposes a mismatch. The ontology JND answers "how much
difference matters to a decision". Conflict detection needs a different
question answered: "are these two sources actually disagreeing". A source
writing "670 g" is asserting a value consistent with 669.5–670.5. A source
writing "670.4 g" is asserting something compatible with that. There is no
disagreement to adjudicate, but a JND of 0.1 on a high-precision attribute
would open a conflict and burn a reviewer's twelve minutes on arithmetic.

Hedged values are worse. "approx. 700 g" against "672 g" is not a conflict — the
first source has told us it does not know precisely. Treating it as one
manufactures work and, if resolved by reliability, would penalise whichever
source was honest about its uncertainty.

## Decision
1. Conflict detection uses an *effective* JND: the maximum of the ontology base
   JND and the widest precision tolerance among the competing claims. Precision
   tolerance is half a unit in the last stated digit, or 5% of the value for
   claims flagged approximate.
2. The effective threshold is carried on the conflict and shown to reviewers, so
   the tolerance being applied is visible rather than implicit.
3. Claims from a single source disagreeing with each other do not open a
   conflict. That is an ingestion defect — two captures of the same page parsed
   differently, or a page changed under us — and routing it to a human reviewer
   asks the wrong person to fix a code bug. It belongs in the outlier and
   parser-diagnostic path instead.
4. Conflicts remain slot-addressed. The identity is the question, so accruing
   evidence never invalidates a reviewer's in-flight work; `compositionHash`
   changes and the reviewer is warned at submission time rather than having the
   decision silently accepted against a claim set they never saw.
5. Blind presentation withholds source identity and reliability, but *retains*
   precision, approximation and outlier flags. Those are epistemic properties of
   the claim itself, which a reviewer legitimately needs, rather than social
   information about who said it — which is what biases the judgement and what
   makes the adjudication a restatement of the prior it is meant to test.

## Consequences
- The conflict queue shrinks, in places substantially, and what remains is
  disagreement that survives both sources' own stated uncertainty. This is the
  single biggest lever on reviewer throughput found so far, and it required no
  change to how reviewing works.
- An attribute whose sources all publish coarsely will generate almost no
  conflicts even where they disagree materially. That is honest — we genuinely
  cannot tell from the published numbers — and it is exactly the situation the
  blind measurement programme (ADR-072) exists to resolve. Low conflict volume
  on an attribute is therefore a signal to go *measure* it, not a sign of health.
- Changing the effective JND changes which conflicts exist, which changes which
  decisions have contested slots, which changes leverage findings and receipt
  contents. It must land as its own single-dimension change with its own diff
  (ADR-068), and it will move the corpus epoch.
Copy