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
  | { readonly ok: false; readonly error: E; readonly diagnostics: readonly Diagnostic[] };

const isDiagnostic = (value: unknown): value is Diagnostic => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === 'string' && typeof record.message === 'string' &&
    (record.severity === 'error' || record.severity === 'warning' || record.severity === 'info');
};

const diagnosticsFor = (error: unknown): readonly Diagnostic[] => {
  if (Array.isArray(error) && error.every(isDiagnostic)) return error;
  if (isDiagnostic(error)) return [error];
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      return [{ code: record.code, message: record.message, severity: 'error' }];
    }
  }
  return [{ code: 'INTERNAL', message: 'operation failed', severity: 'error' }];
};

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E, diagnostics: readonly Diagnostic[] = diagnosticsFor(error)): Result<never, E> => ({ ok: false, error, diagnostics });
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T; warnings?: readonly Diagnostic[] } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E; diagnostics: readonly Diagnostic[] } => !r.ok;
export const isError = (d: Diagnostic): boolean => d.severity === 'error';
export const hasErrors = (ds: readonly Diagnostic[]): boolean => ds.some(isError);
