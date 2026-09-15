/**
 * ADR-080: Result has one canonical owner in engine-contracts.
 * Kernel re-exports it so legacy kernel-local imports remain source-compatible.
 */
export {
  type Result,
  ok,
  err,
  isOk,
  isErr,
  isError,
  hasErrors,
} from '@camefa/engine-contracts';
