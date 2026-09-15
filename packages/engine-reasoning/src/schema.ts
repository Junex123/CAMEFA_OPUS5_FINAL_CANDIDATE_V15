import type { CompiledOntology } from '@camefa/engine-ontology';

/** Compiled from the ontology at runtime: the interpreter can never drift behind it. */
export const buildInterpreterSchema = (ont: CompiledOntology) => {
  const capabilities = [...ont.capabilities.values()].map((c) => ({
    key: c.key,
    label: c.label,
    interpretation: c.interpretation,
    unit: c.output.kind === 'quantity' ? c.output.canonicalUnit : null,
    levels: c.output.kind === 'ordinal' ? c.output.levels : null,
  })).sort((a, b) => (a.key < b.key ? -1 : 1));

  const activities = [...ont.activities.values()]
    .map((a) => ({ key: a.key, label: a.label }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  return {
    type: 'object',
    additionalProperties: false,
    required: ['activities', 'requirements'],
    properties: {
      activities: {
        type: 'array',
        items: { type: 'string', enum: activities.map((a) => a.key) },
      },
      requirements: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['capability', 'op', 'emphasis'],
          properties: {
            capability: { type: 'string', enum: capabilities.map((c) => c.key) },
            op: { type: 'string', enum: ['gte', 'lte', 'within', 'maximize', 'minimize'] },
            value: { type: 'number' },
            unit: { type: 'string', enum: ont.units.keys() },
            level: { type: 'string' },
            emphasis: {
              type: 'string',
              enum: ['must', 'strongly_prefer', 'prefer', 'nice_to_have', 'indifferent'],
            },
          },
        },
      },
    },
    $meta: { ontologyFingerprint: ont.fingerprint, capabilities, activities },
  } as const;
};

export interface CandidateRequirement {
  readonly capability: string;
  readonly op: string;
  readonly value?: number;
  readonly unit?: string;
  readonly level?: string;
  readonly emphasis: string;
}

export interface InterpreterProposal {
  readonly activities: readonly string[];
  readonly requirements: readonly CandidateRequirement[];
}

export interface InterpreterPort {
  propose(
    utterances: readonly { text: string; locale: string }[],
    schema: ReturnType<typeof buildInterpreterSchema>,
  ): Promise<InterpreterProposal>;
}
