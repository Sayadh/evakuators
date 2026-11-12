/**
 * Missed offers (2026-11, the driver app's «Բաց թողնված պատվերներ»): how an
 * EXPIRED offer is explained to the driver. Pure; unit-tested.
 */

/** Why an EXPIRED offer was missed — what the driver can act on */
export function missedReason(deliveredAt: Date | null, closeReason: string | null): 'NOT_DELIVERED' | 'TOO_LATE' | 'NO_ANSWER' {
  if (deliveredAt === null) return 'NOT_DELIVERED'
  if (closeReason === 'DEADLINE_AT_ACCEPT' || closeReason === 'DEADLINE_AT_REJECT') return 'TOO_LATE'
  return 'NO_ANSWER'
}

/** What became of the order afterwards (never who took it) */
export function missedOutcome(status: string, takenByOther: boolean): 'TAKEN' | 'CANCELLED' | 'OPEN' | 'CLOSED' {
  if (status === 'CANCELLED') return 'CANCELLED'
  if (takenByOther) return 'TAKEN'
  if (status === 'COMPLETED') return 'CLOSED'
  return 'OPEN'
}
