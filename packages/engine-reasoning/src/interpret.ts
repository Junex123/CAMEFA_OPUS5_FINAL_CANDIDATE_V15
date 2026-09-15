import { sha256, type UnitRegistry } from '@camefa/engine-kernel';
import type { CompiledOntology, ActivityKey, Emphasis } from '@camefa/engine-ontology';
import { EMPHASIS_WEIGHT, expandActivity, type Requirement, type RequirementId, type RequirementSet } from './requirement.js';
import { buildInterpreterSchema, type InterpreterPort } from './schema.js';
import { validateCandidate, type Rejection } from './validate-candidate.js';
import { mergeRequirements, type MergeConflict } from './merge.js';
import type { Signal, DecisionContext } from './signal.js';

export interface InterpretResult {
  readonly set: RequirementSet;
  readonly activities: readonly ActivityKey[];
  readonly rejected: readonly Rejection[];
  readonly conflicts: readonly MergeConflict[];
  readonly cacheKey: string;
}

/** Intensity scales profile emphasis: occasional work should not impose primary-work gates. */
const INTENSITY_SCALE = { occasional: 0.6, regular: 0.85, primary: 1.0 } as const;

export class Interpreter {
  constructor(
    private readonly ontology: CompiledOntology,
    private readonly port: InterpreterPort,
  ) {}

  async interpret(signals: readonly Signal[], ctx: DecisionContext): Promise<InterpretResult> {
    const schema = buildInterpreterSchema(this.ontology);
    const utterances = signals.filter((s) => s.kind === 'utterance').map((s) => ({ text: s.text, locale: s.locale }));

    const proposal = utterances.length > 0
      ? await this.port.propose(utterances, schema)
      : { activities: [], requirements: [] };

    const rejected: Rejection[] = [];
    const collected: Requirement[] = [];

    const declaredActivities = new Set<ActivityKey>();
    for (const s of signals) {
      if (s.kind === 'activity') declaredActivities.add(s.activity);
    }
    for (const key of proposal.activities) {
      if (this.ontology.activities.has(key as ActivityKey)) declaredActivities.add(key as ActivityKey);
    }

    const intensityOf = (a: ActivityKey) =>
      INTENSITY_SCALE[
        signals.find((s): s is Extract<Signal, { kind: 'activity' }> =>
          s.kind === 'activity' && s.activity === a)?.intensity ?? 'regular'
      ];

    for (const key of [...declaredActivities].sort()) {
      const profile = this.ontology.activities.get(key);
      if (!profile) continue;
      const scale = intensityOf(key);
      for (const r of expandActivity(profile).requirements) {
        collected.push({ ...r, weight: r.weight * scale });
      }
    }

    proposal.requirements.forEach((raw, i) => {
      const v = validateCandidate(raw, this.ontology);
      if (!v.ok) {
        rejected.push(v.error);
        return;
      }
      collected.push({
        id: `stated:${i}` as RequirementId,
        capability: v.value.capability,
        op: v.value.op,
        ...(v.value.target !== undefined ? { target: v.value.target } : {}),
        hardness: v.value.emphasis === 'must' ? 'blocking' : 'weighted',
        weight: EMPHASIS_WEIGHT[v.value.emphasis],
        origin: { kind: 'stated' },
        rationale: 'Stated directly in your request.',
      });
    });

    signals.forEach((s, i) => {
      if (s.kind !== 'selection') return;
      collected.push({
        id: `selection:${i}` as RequirementId,
        capability: s.capability,
        op: s.op,
        ...(s.target !== undefined ? { target: s.target } : {}),
        hardness: s.emphasis === 'must' ? 'blocking' : 'weighted',
        weight: EMPHASIS_WEIGHT[s.emphasis],
        origin: { kind: 'stated' },
        rationale: 'Selected in your filters.',
      });
    });

    for (const r of this.#fromExif(signals)) collected.push(r);

    const dropped = new Set(
      signals.filter((s): s is Extract<Signal, { kind: 'correction' }> => s.kind === 'correction' && s.action === 'drop')
        .map((s) => s.requirement),
    );

    const { merged, conflicts } = mergeRequirements(
      collected.filter((r) => !dropped.has(r.id) && (r.hardness === 'blocking' || r.weight > 0)),
      this.ontology.units,
    );

    const aggregationP = Math.min(
      0,
      ...[...declaredActivities]
        .map((k) => this.ontology.activities.get(k)?.aggregationP ?? 0),
    );

    return {
      set: { requirements: merged, aggregationP },
      activities: [...declaredActivities].sort(),
      rejected,
      conflicts,
      cacheKey: sha256({
        signals, ontology: this.ontology.fingerprint, profile: ctx.profileVersion,
      }),
    };
  }

  /** Observed evidence outranks self-report: origin 'observed' beats 'profile'. */
  #fromExif(signals: readonly Signal[]): readonly Requirement[] {
    const exif = signals.find((s): s is Extract<Signal, { kind: 'exif' }> => s.kind === 'exif');
    if (!exif || exif.summary.frameCount < 500) return [];
    const cap = this.ontology.capabilities.get('lowlight.iso_headroom' as never);
    if (!cap || cap.output.kind !== 'quantity') return [];
    const stopsAboveBase = Math.log2(Math.max(exif.summary.p90Iso, 100) / 100);
    if (stopsAboveBase < 1) return [];
    return [{
      id: 'observed:lowlight' as RequirementId,
      capability: cap.key,
      op: 'gte',
      target: { kind: 'quantity', value: { value: Number(stopsAboveBase.toFixed(2)), unit: cap.output.canonicalUnit } },
      hardness: 'weighted',
      weight: EMPHASIS_WEIGHT.strongly_prefer,
      origin: { kind: 'observed', evidence: `${exif.summary.frameCount} frames, 90th percentile ISO ${exif.summary.p90Iso}` },
      rationale: 'Your own shooting history shows you regularly work at this ISO, regardless of what you plan for.',
    }];
  }
}
