export type AttributeType = 'numeric' | 'ordinal' | 'categorical' | 'boolean';

export type Direction = 'higher_better' | 'lower_better' | 'target';

export interface AttributeDef {
  attributeId: string;
  type: AttributeType;
  unit: string;
  direction: Direction;
  /**
   * Just-noticeable difference in `unit`. Differences at or below this cannot
   * change a decision, so conflict detection ignores them (ADR-061). Required
   * for numeric attributes — without it every rounding difference between two
   * spec sheets becomes a conflict and the adjudication queue fills with noise.
   */
  jnd: number | null;
  /** Plausible range; values outside are flagged as outliers (ADR-057). */
  plausible: { min: number; max: number } | null;
  ordinalScale?: string[];
  label: string;
  derived: boolean;
}

export interface RequirementDef {
  requirementId: string;
  attributeId: string;
  /** Hard requirements eliminate; soft requirements score. */
  hard: boolean;
  /** Satisfaction curve anchors: value → satisfaction in [0,1]. */
  curve: { at: number; satisfaction: number }[];
  rationale: string;
}

export class AttributeError extends Error {}

export function assertAttributeCoherent(def: AttributeDef): void {
  if (def.type === 'numeric' && def.jnd === null) {
    throw new AttributeError(
      `${def.attributeId}: numeric attributes require a jnd; without one every ` +
        'rounding difference becomes an adjudicable conflict',
    );
  }
  if (def.jnd !== null && !(def.jnd >= 0)) {
    throw new AttributeError(`${def.attributeId}: jnd must be non-negative`);
  }
  if (def.plausible && def.plausible.min >= def.plausible.max) {
    throw new AttributeError(`${def.attributeId}: empty plausible range`);
  }
  if (def.type === 'ordinal' && (def.ordinalScale?.length ?? 0) < 2) {
    throw new AttributeError(`${def.attributeId}: ordinal attributes need a scale`);
  }
}

/** Piecewise-linear interpolation over the curve anchors, clamped at the ends. */
export function satisfaction(req: RequirementDef, value: number): number {
  const pts = [...req.curve].sort((a, b) => a.at - b.at);
  if (pts.length === 0) return 0;
  if (value <= pts[0]!.at) return pts[0]!.satisfaction;
  const last = pts[pts.length - 1]!;
  if (value >= last.at) return last.satisfaction;

  for (let i = 1; i < pts.length; i += 1) {
    const lo = pts[i - 1]!;
    const hi = pts[i]!;
    if (value <= hi.at) {
      const span = hi.at - lo.at;
      const t = span === 0 ? 1 : (value - lo.at) / span;
      return lo.satisfaction + t * (hi.satisfaction - lo.satisfaction);
    }
  }
  return last.satisfaction;
}
