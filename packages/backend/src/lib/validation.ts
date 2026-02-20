/**
 * Request validation schemas using Zod
 */

import { z } from 'zod';

export const InitiateRequestSchema = z.object({
  userId: z.string().optional(),
  planName: z.string().optional(),
  mrr: z.number().nonnegative().optional(),
  accountAge: z.string().optional(),
});

export const CompleteRequestSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  userId: z.string().optional(),
  outcome: z.enum(['retained', 'churned']).optional(),
  acceptedOffer: z.any().optional(),
  transcript: z.array(z.any()).optional(),
});

export const PrefetchRequestSchema = z.object({
  userId: z.string().min(1, 'userId is required for prefetch'),
  planName: z.string().optional(),
  mrr: z.number().nonnegative().optional(),
  accountAge: z.string().optional(),
});

export type InitiateRequest = z.infer<typeof InitiateRequestSchema>;
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;
export type PrefetchRequest = z.infer<typeof PrefetchRequestSchema>;
