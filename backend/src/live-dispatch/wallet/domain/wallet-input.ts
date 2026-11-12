import { z } from 'zod'

/** An operator's credit (positive) or debit (negative), always with a reason the driver will see */
export const walletAdjustSchema = z.object({
  amountAmd: z
    .number()
    .int()
    .refine((n) => n !== 0 && Math.abs(n) <= 5_000_000, 'non-zero, at most 5 000 000'),
  /** Optional (2026-11-12): a quick credit needs only the amount and a confirmation */
  note: z.string().trim().max(500).optional(),
})

/** An operator's credit limit for one driver (how far below zero he may go) */
export const creditLimitSchema = z.object({ creditLimitAmd: z.number().int().min(0).max(1_000_000) }).strict()

/** An operator's decision on a minimum price, after calling the customer */
export const priceReviewSchema = z
  .object({
    decision: z.enum(['APPROVE', 'CORRECT']),
    correctedPriceAmd: z.number().int().positive().max(10_000_000).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((v) => v.decision !== 'CORRECT' || typeof v.correctedPriceAmd === 'number', { message: 'correctedPriceAmd required', path: ['correctedPriceAmd'] })
