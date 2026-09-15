import type { NarrativePlan, PlanNodeId, HedgeLevel } from './plan.js';
import { HEDGE_RANK } from './plan.js';

export interface GeneratedSegment {
  readonly text: string;
  readonly refs: readonly PlanNodeId[];
  readonly kind: 'assertion' | 'connective';
}

export type Violation =
  | { readonly code: 'UNREFERENCED_ASSERTION'; readonly text: string }
  | { readonly code: 'UNKNOWN_REF'; readonly ref: string }
  | { readonly code: 'UNBOUND_NUMBER'; readonly value: string; readonly text: string }
  | { readonly code: 'UNBOUND_ENTITY'; readonly name: string }
  | { readonly code: 'HEDGE_TOO_STRONG'; readonly required: HedgeLevel; readonly found: HedgeLevel };

const ASSERTIVE_MARKERS = /\b(will|is|are|does|guarantees?|always|definitely|certainly)\b/i;
const MEASURED_MARKERS = /\b(should|typically|generally|in practice)\b/i;
const QUALIFIED_MARKERS = /\b(likely|probably|appears?|seems?|indicates?)\b/i;
const SPECULATIVE_MARKERS = /\b(may|might|could|estimated?|suggests?|our estimate)\b/i;

const NUMBER_PATTERN = /-?\d+(?:[.,]\d+)?/g;

export const validate = (
  plan: NarrativePlan,
  segments: readonly GeneratedSegment[],
): readonly Violation[] => {
  const violations: Violation[] = [];
  const byId = new Map(plan.nodes.map((n) => [n.id as string, n]));

  const knownEntities = new Set(
    [...plan.entityLabels.values()].flatMap((l) => [l, ...l.split(/\s+/)]).map((s) => s.toLowerCase()),
  );

  for (const seg of segments) {
    if (seg.kind === 'connective') continue;

    if (seg.refs.length === 0) {
      violations.push({ code: 'UNREFERENCED_ASSERTION', text: seg.text });
      continue;
    }
    for (const ref of seg.refs) {
      if (!byId.has(ref as string)) violations.push({ code: 'UNKNOWN_REF', ref: ref as string });
    }

    const licensed = new Set(
      seg.refs.flatMap((r) => byId.get(r as string)?.facts.map((f) => normalize(f.display)) ?? []),
    );
    const licensedNumerics = new Set(
      seg.refs.flatMap((r) =>
        (byId.get(r as string)?.facts ?? [])
          .filter((f) => f.numeric !== null)
          .map((f) => normalize(String(f.numeric))),
      ),
    );

    for (const raw of seg.text.match(NUMBER_PATTERN) ?? []) {
      const n = normalize(raw);
      const bound = licensed.has(n) || licensedNumerics.has(n) ||
        [...licensedNumerics].some((l) => Math.abs(Number(l) - Number(n)) < 0.05);
      if (!bound) violations.push({ code: 'UNBOUND_NUMBER', value: raw, text: seg.text });
    }

    const floorRank = HEDGE_RANK[plan.hedgeFloor];
    const nodeRank = Math.max(...seg.refs.map((r) => HEDGE_RANK[byId.get(r as string)?.hedge ?? 'assertive']));
    const required = Math.max(floorRank, nodeRank);
    const found = detectHedge(seg.text);
    if (HEDGE_RANK[found] < required) {
      violations.push({
        code: 'HEDGE_TOO_STRONG',
        required: levelOf(required),
        found,
      });
    }
  }

  const named = segments.flatMap((s) => s.text.match(/\b[A-Z][a-zA-Z0-9-]{2,}\b/g) ?? []);
  for (const name of named) {
    if (!knownEntities.has(name.toLowerCase()) && !STOPWORDS.has(name.toLowerCase())) {
      violations.push({ code: 'UNBOUND_ENTITY', name });
    }
  }

  return violations;
};

const normalize = (s: string) => s.replace(',', '.').replace(/[^\d.-]/g, '');

const detectHedge = (text: string): HedgeLevel =>
  SPECULATIVE_MARKERS.test(text) ? 'speculative'
  : QUALIFIED_MARKERS.test(text) ? 'qualified'
  : MEASURED_MARKERS.test(text) ? 'measured'
  : ASSERTIVE_MARKERS.test(text) ? 'assertive'
  : 'measured';

const levelOf = (rank: number): HedgeLevel =>
  (['assertive', 'measured', 'qualified', 'speculative'] as const)[rank] ?? 'speculative';

const STOPWORDS = new Set([
  'we', 'it', 'if', 'the', 'this', 'that', 'sources', 'nothing', 'relaxing', 'choose',
]);
