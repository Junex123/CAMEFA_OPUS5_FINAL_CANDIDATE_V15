export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: Severity;
  readonly path?: string;
}

/** Canonical Result surface for every package boundary (ADR-080). */
export type Result<T, E = readonly Diagnostic[]> =
  | { readonly ok: true; readonly value: T; readonly warnings?: readonly Diagnostic[] }
  | { readonly ok: false; readonly error: E; readonly diagnostics: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error, diagnostics: error });
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T; warnings?: readonly Diagnostic[] } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E; diagnostics: E } => !r.ok;
export const isError = (d: Diagnostic): boolean => d.severity === 'error';
export const hasErrors = (ds: readonly Diagnostic[]): boolean => ds.some(isError);
