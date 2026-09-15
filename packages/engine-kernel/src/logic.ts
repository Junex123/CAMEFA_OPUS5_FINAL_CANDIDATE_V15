export type Verdict = 'satisfied' | 'violated' | 'indeterminate';

export const andK = (a: Verdict, b: Verdict): Verdict =>
  a === 'violated' || b === 'violated'
    ? 'violated'
    : a === 'indeterminate' || b === 'indeterminate'
      ? 'indeterminate'
      : 'satisfied';

export const allK = (vs: readonly Verdict[]): Verdict => vs.reduce(andK, 'satisfied');

export const orK = (a: Verdict, b: Verdict): Verdict =>
  a === 'satisfied' || b === 'satisfied'
    ? 'satisfied'
    : a === 'indeterminate' || b === 'indeterminate'
      ? 'indeterminate'
      : 'violated';
