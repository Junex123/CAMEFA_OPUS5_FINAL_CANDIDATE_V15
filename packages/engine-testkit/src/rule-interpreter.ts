/** Deterministic stand-in for the LLM. Keeps reasoning tests model-free. */
export interface InterpreterProposal {
  readonly activities: readonly string[];
  readonly requirements: readonly {
    readonly capability: string;
    readonly op: string;
    readonly value?: number;
    readonly unit?: string;
    readonly emphasis: string;
  }[];
}

export interface InterpreterPort {
  propose(utterances: readonly { text: string; locale: string }[]): Promise<InterpreterProposal>;
}

export class RuleBasedInterpreter implements InterpreterPort {
  async propose(
    utterances: readonly { text: string; locale: string }[],
  ): Promise<InterpreterProposal> {
    const text = utterances.map((u) => u.text.toLowerCase()).join(' ');
    const activities: string[] = [];
    if (/wedding|bride|reception|ceremony/.test(text)) activities.push('photo.wedding');

    const requirements: Array<InterpreterProposal['requirements'][number]> = [];
    const mass = /under (\d+)\s*g/.exec(text);
    if (mass) {
      requirements.push({
        capability: 'handling.carry_mass', op: 'lte',
        value: Number(mass[1]), unit: 'g', emphasis: 'must',
      });
    }
    if (/light(est|weight)|portable/.test(text)) {
      requirements.push({ capability: 'handling.carry_mass', op: 'minimize', emphasis: 'prefer' });
    }
    if (/hallucinate/.test(text)) {
      requirements.push({ capability: 'telepathy.range', op: 'gte', value: 3, unit: 'm', emphasis: 'must' });
    }
    return { activities, requirements };
  }
}
