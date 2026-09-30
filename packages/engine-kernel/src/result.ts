/**
 * Kernel-local Result surface.
 *
 * Contracts own the wire-level diagnostic Result. Keeping the kernel's small
 * computational Result implementation here avoids a package dependency cycle
 * back into contracts while preserving the same ok/error ergonomics.
 */
export type Result<T, E = readonly unknown[]> =
  | { readonly ok: true; readonly value: T; readonly warnings?: readonly unknown[] }
  | { readonly ok: false; readonly error: E; readonly diagnostics: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error, diagnostics: error });
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T; warnings?: readonly unknown[] } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E; diagnostics: E } => !r.ok;
export const isError = (d: { readonly severity?: unknown }): boolean => d.severity === 'error';
export const hasErrors = (ds: readonly { readonly severity?: unknown }[]): boolean => ds.some(isError);
