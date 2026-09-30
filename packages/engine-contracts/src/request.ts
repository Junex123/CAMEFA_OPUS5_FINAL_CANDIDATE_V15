import { z } from 'zod';
import type { AttributeRef, SlotRef } from './refs.js';

export interface HardConstraint {
  readonly attribute: AttributeRef;
  readonly op: 'gte' | 'lte' | 'eq' | 'in';
  readonly value: number | string | string[];
}

export interface Weight {
  readonly attribute: AttributeRef;
  readonly weight: number;
}

export interface NormalizedRequest {
  readonly profile: string;
  /** Entity type used when the request does not carry an explicit catalog type. */
  readonly entityType?: string;
  readonly candidates: readonly SlotRef[];
  readonly constraints: readonly HardConstraint[];
  readonly weights: readonly Weight[];
  readonly locale: string;
}

export const attributeRefSchema: z.ZodType<AttributeRef> = z.custom<AttributeRef>(
  (value): value is AttributeRef => typeof value === 'string' && value.length > 0,
  { message: 'attribute ref must be a non-empty string' },
);

export const slotRefSchema: z.ZodType<SlotRef> = z.custom<SlotRef>(
  (value): value is SlotRef => typeof value === 'string' && value.length > 0,
  { message: 'slot ref must be a non-empty string' },
);

export const hardConstraintSchema: z.ZodType<HardConstraint> = z.object({
  attribute: attributeRefSchema,
  op: z.enum(['gte', 'lte', 'eq', 'in']),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
}).strict();

export const weightSchema: z.ZodType<Weight> = z.object({
  attribute: attributeRefSchema,
  weight: z.number().positive().finite(),
}).strict();

/** Canonical wire + addressed request shape (ADR-081). */
export const normalizedRequestSchema: z.ZodType<NormalizedRequest, z.ZodTypeDef, unknown> = z.object({
  profile: z.string().min(1),
  entityType: z.string().min(1).optional(),
  candidates: z.array(slotRefSchema).min(2),
  constraints: z.array(hardConstraintSchema).default([]),
  weights: z.array(weightSchema).min(1),
  locale: z.string().default('en'),
}).strict();

export type CurrencyCode = string;
export type EntityId = string;
export type ActorKind = 'anonymous' | 'user' | 'service';
export interface ActorRef { readonly kind: ActorKind; readonly id: string; }

export type PrimitiveName =
  | 'resolve' | 'describe' | 'derive' | 'interpret' | 'evaluate'
  | 'compare' | 'solve' | 'simulate' | 'explain';

export interface RequestContext {
  readonly requestId: string;
  readonly actor: ActorRef;
  readonly now: string;
  readonly asOf?: string;
  readonly locale: string;
  readonly currency: CurrencyCode;
}

export interface Request<P extends PrimitiveName, I> {
  readonly primitive: P;
  readonly input: I;
  readonly context: RequestContext;
}
