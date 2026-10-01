export type Verdict =
  | { readonly kind: 'select'; readonly optionToken: string }
  | { readonly kind: 'reject_all'; readonly note: string }
  | { readonly kind: 'both_valid_over_time'; readonly boundary: string }
  | { readonly kind: 'escalate'; readonly note: string }
  | { readonly kind: 'abstain'; readonly note: string };

export async function submitVerdict(_input: {
  itemId: string;
  leaseToken: string;
  verdict: Verdict;
  certainty: 1 | 2 | 3 | 4 | 5;
  elapsedMs: number;
}): Promise<void> {}

export async function unblindItem(_input: {
  itemId: string;
  leaseToken: string;
}): Promise<void> {}
