import type { Result } from './diagnostics.js';
import type { DecisionReceipt } from './receipt.js';
import type { CostReport } from './cost.js';
import type { ActorRef } from './request.js';
import type { ContractError } from './errors.js';

export type OntologyRegistryPort = {
  load(versions?: Readonly<Record<string, string>>): Promise<Result<unknown, ContractError>>;
};
export type ActivityProfilePort = {
  get(profileId: string, ontology: unknown): Promise<Result<unknown, ContractError>>;
};
export type ArticulatorPort = {
  render(plan: unknown, locale: string): Promise<Result<{ prose: string; tokens: number }, ContractError>>;
};
export type ReceiptSinkPort = {
  put(receipt: DecisionReceipt, lineage: unknown): Promise<void>;
  get(receiptId: string): Promise<DecisionReceipt | null>;
};
export type RateLimiterPort = {
  admit(
    actor: ActorRef,
    estimatedUnits: number,
    nowMs: number,
  ): Promise<{ admitted: true; reservationId?: string } | { admitted: false; retryAfterMs: number }>;
  settle(actor: ActorRef, reservationId: string, actual: CostReport, nowMs: number): Promise<void>;
};
export type TelemetryPort = {
  emit(event: { name: string; fields: Record<string, unknown> }): void;
};
