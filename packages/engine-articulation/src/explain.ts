import type { NarrativePlan } from './plan.js';
import { validate, type GeneratedSegment, type Violation } from './validator.js';

export interface RealizerPort {
  realize(
    plan: NarrativePlan,
    repairFrom?: { segments: readonly GeneratedSegment[]; violations: readonly Violation[] },
  ): Promise<readonly GeneratedSegment[]>;
}

export interface Narrative {
  readonly text: string;
  readonly segments: readonly GeneratedSegment[];
  readonly source: 'model' | 'repaired' | 'template';
  readonly violations: readonly Violation[];
  readonly planId: string;
}

/** Deterministic rendering of the plan. Less pleasant, always correct. */
export const renderTemplate = (plan: NarrativePlan): Narrative => {
  const segments: GeneratedSegment[] = plan.nodes.map((n) => ({
    text: n.template,
    refs: [n.id],
    kind: 'assertion',
  }));
  return {
    text: segments.map((s) => s.text).join(' '),
    segments,
    source: 'template',
    violations: [],
    planId: plan.id,
  };
};

export class Explainer {
  constructor(
    private readonly realizer: RealizerPort | null,
    private readonly onFallback?: (planId: string, violations: readonly Violation[]) => void,
  ) {}

  async explain(plan: NarrativePlan): Promise<Narrative> {
    if (!this.realizer) return renderTemplate(plan);

    let segments: readonly GeneratedSegment[];
    try {
      segments = await this.realizer.realize(plan);
    } catch {
      this.onFallback?.(plan.id, []);
      return renderTemplate(plan);
    }

    let violations = validate(plan, segments);
    if (violations.length === 0) {
      return { text: join(segments), segments, source: 'model', violations: [], planId: plan.id };
    }

    try {
      const repaired = await this.realizer.realize(plan, { segments, violations });
      const after = validate(plan, repaired);
      if (after.length === 0) {
        return { text: join(repaired), segments: repaired, source: 'repaired', violations: [], planId: plan.id };
      }
      violations = after;
    } catch {
      // fall through to template
    }

    this.onFallback?.(plan.id, violations);
    return { ...renderTemplate(plan), violations };
  }
}

const join = (segments: readonly GeneratedSegment[]) =>
  segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
