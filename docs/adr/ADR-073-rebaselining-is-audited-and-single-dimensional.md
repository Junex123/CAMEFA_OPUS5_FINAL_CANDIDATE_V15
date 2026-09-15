# ADR-073: Rebaselining is audited, single-dimensional, and cannot absorb anchor failures

## Status
Accepted (Session 030). Closes the loop opened by ADR-071.

## Context
`epochGuard` (ADR-071) correctly refuses to compare decisions across a corpus
swap, and instructs the operator to rebaseline. That instruction creates the
most dangerous command in the repository: rebaselining rewrites the reference
against which all future change is measured.

Three ways it destroys the gate:

1. **Sealing under the candidate config.** The natural implementation uses
   whatever engine config is in the working tree. Anyone running this command is
   doing so *while* trying to land something, so the candidate's behaviour
   becomes the definition of correct, and every later run compares the candidate
   to itself. The gate reports green permanently.
2. **Absorbing anchor failures.** If the new corpus makes a decision violate an
   anchored expectation and that decision is sealed as the baseline, the
   violation stops being a finding and becomes the reference. Anchors are
   independent measurements; they do not go stale when the corpus changes. A
   failure here means ingestion is wrong.
3. **Silent invocation.** A rebaseline with no recorded reason is
   indistinguishable from an attempt to make a red build go away.

## Decision
1. Baselines are sealed under the **shipped** engine config, supplied
   explicitly as `--shipped-engine-config`. If a candidate config is also
   present and differs in ontology, model or calibration, the command refuses.
   The corpus swap lands as its own change; the candidate is then measured
   against the new baselines as an ordinary gate run with one moving dimension.
2. Anchor expectations are evaluated during rebaselining. Any question with an
   anchor failure is reported and the command exits non-zero. Those questions
   are not silently accepted as the new reference.
3. `--reason` and `--approved-by` are mandatory. The report is written to disk
   and retained; rebaselining is an audited act.
4. The command refuses when the corpus epoch has not changed, since valid
   baselines exist and resealing would only discard comparable history.
5. Prior baselines are archived, never overwritten. Receipts are
   content-addressed and immutable, so retaining them costs storage and nothing
   else, and a suspicious rebaseline can be reconstructed afterwards.

## Consequences
- Landing the first real corpus takes two changes, not one. This is the
  intended friction.
- A corpus that breaks anchors cannot be baselined at all, so anchor coverage
  bounds how safely the corpus can be replaced — the same conclusion reached
  from the gate side in ADR-069 and from the measurement side in ADR-072. The
  three arguments converging on anchor coverage is the strongest signal in the
  project about where effort belongs.
Copy