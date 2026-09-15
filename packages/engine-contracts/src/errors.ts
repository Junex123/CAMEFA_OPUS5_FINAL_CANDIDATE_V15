export type ContractErrorCode =
  | 'INVALID_REQUEST'
  | 'UNKNOWN_PRIMITIVE'
  | 'ONTOLOGY_UNAVAILABLE'
  | 'PACK_VERSION_NOT_FOUND'
  | 'BUDGET_EXCEEDED'
  | 'RATE_LIMITED'
  | 'CITATION_VIOLATION'
  | 'INFEASIBLE'
  | 'RESOLVER_FAILURE'
  | 'INTERNAL';

export type ContractError = {
  readonly code: ContractErrorCode;
  readonly message: string;
  /** Machine-readable detail; must be JSON-serializable (ADR-016). */
  readonly detail?: Readonly<Record<string, unknown>>;
  /** True when the caller can retry unchanged and may succeed. */
  readonly retryable: boolean;
  /** Present on RATE_LIMITED / BUDGET_EXCEEDED. */
  readonly retryAfterMs?: number;
};

export const contractError = (
  code: ContractErrorCode,
  message: string,
  opts: Partial<Omit<ContractError, 'code' | 'message'>> = {},
): ContractError => ({
  code,
  message,
  retryable: opts.retryable ?? false,
  ...(opts.detail ? { detail: opts.detail } : {}),
  ...(opts.retryAfterMs !== undefined ? { retryAfterMs: opts.retryAfterMs } : {}),
});

/** Never leak internals across the contract boundary. */
export const wrapUnknown = (e: unknown): ContractError =>
  contractError('INTERNAL', 'engine failure', {
    retryable: true,
    detail: { kind: e instanceof Error ? e.name : typeof e },
  });
