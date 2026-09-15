import { ok, err, type Result } from '@camefa/engine-kernel';
import type { EntityId, Quantity, Brand } from '@camefa/engine-kernel';
import type { RoleKey } from '@camefa/engine-ontology';
import type { MarginalGain } from './marginal.js';
import { NULL_SINK, type CostSink } from '@camefa/engine-kernel';

export type ConfigurationId = Brand<string, 'ConfigurationId'>;
export type Goal =
  | { readonly kind: 'acquire'; readonly role: RoleKey }
  | { readonly kind: 'complete_kit'; readonly roles: readonly RoleKey[] }
  | { readonly kind: 'close_gap' }
  | { readonly kind: 'upgrade_path'; readonly horizon: number; readonly tranches: number }
  | { readonly kind: 'substitute'; readonly replacing: EntityId };

export interface AllocationCurve {
  readonly points: readonly { readonly budget: Quantity; readonly bestScore: { readonly lower: number; readonly upper: number }; readonly kit: ConfigurationId }[];
  readonly kneePoint?: Quantity;
  readonly nextBestSpend?: { readonly amount: Quantity; readonly role: RoleKey; readonly gain: MarginalGain };
}

export interface Configuration {
  readonly id: ConfigurationId;
  readonly score: number;
  readonly cost?: number;
  readonly parts?: readonly string[];
}

export interface SolveArgs {
  readonly initial: readonly Configuration[];
  readonly expand: (configuration: Configuration) => readonly Configuration[];
  readonly maxConfigurations?: number;
  readonly beamWidth?: number;
  readonly goal?: Goal;
  readonly onCost?: CostSink;
}

export interface SolveEnvelope {
  readonly configurations: readonly Configuration[];
  readonly frontier: AllocationCurve | null;
  readonly truncated: boolean;
  readonly truncationReason?: string;
}

const envelopeOf = (configurations: readonly Configuration[], truncated = false, truncationReason?: string): SolveEnvelope => ({
  configurations,
  frontier: null,
  truncated,
  ...(truncationReason === undefined ? {} : { truncationReason }),
});

const compare = (a: Configuration, b: Configuration): number =>
  b.score - a.score || a.id.localeCompare(b.id);

const dedupe = (items: readonly Configuration[]): Configuration[] => {
  const byId = new Map<string, Configuration>();
  for (const item of items) {
    const prior = byId.get(item.id);
    if (prior === undefined || compare(item, prior) < 0) byId.set(item.id, item);
  }
  return [...byId.values()].sort(compare);
};

/** Deterministic Pareto/beam search. It never invents a result when a budget closes the search. */
export function solve(args: SolveArgs): Result<SolveEnvelope, Error> {
  const maxConfigurations = args.maxConfigurations ?? 64;
  const beamWidth = args.beamWidth ?? Math.min(16, maxConfigurations);
  const charge = args.onCost ?? NULL_SINK;
  let frontier = dedupe(args.initial);
  const configurations: Configuration[] = [];
  const seen = new Set(frontier.map((c) => c.id));

  while (frontier.length > 0 && configurations.length < maxConfigurations) {
    try {
      charge.charge('scoringPasses', frontier.length);
    } catch (cause) {
      return ok(envelopeOf(configurations, true, cause instanceof Error ? cause.message : 'budget exhausted'));
    }

    configurations.push(...frontier.filter((c) => !configurations.some((x) => x.id === c.id)));
    if (configurations.length >= maxConfigurations) break;

    const next: Configuration[] = [];
    for (const configuration of frontier) {
      for (const candidate of args.expand(configuration)) {
        if (!seen.has(candidate.id)) {
          seen.add(candidate.id);
          next.push(candidate);
        }
      }
    }
    frontier = dedupe(next).slice(0, beamWidth);
  }

  return ok(envelopeOf(configurations.slice(0, maxConfigurations), false));
}
