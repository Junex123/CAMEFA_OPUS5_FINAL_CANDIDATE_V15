import { z } from 'zod';
export const decisionRequestSchema=z.object({profile:z.string().min(1),candidates:z.array(z.string()).min(2),constraints:z.array(z.unknown()).default([]),weights:z.array(z.unknown()).default([]),locale:z.string().default('en')}).strict();
export const EvaluateSchema=decisionRequestSchema; export const SolveSchema=decisionRequestSchema; export const InterpretSchema=decisionRequestSchema; export const ExplainSchema=decisionRequestSchema; export const CompareSchema=decisionRequestSchema; export const receiptIdSchema=/^[0-9a-f]{64}$/;
