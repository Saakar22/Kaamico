export const DISPUTE_REASONS = [
  'NO_SHOW',
  'POOR_QUALITY',
  'OVERCHARGE',
  'DAMAGE',
  'SAFETY',
  'PAYMENT',
  'OTHER',
] as const
export type DisputeReason = (typeof DISPUTE_REASONS)[number]

/** Plain words for the UI ("report a problem", never "dispute"; §7.7). Client-safe. */
export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  NO_SHOW: 'Someone did not turn up',
  POOR_QUALITY: 'The work was not done properly',
  OVERCHARGE: 'Charged more than agreed',
  DAMAGE: 'Something was damaged',
  SAFETY: 'Safety concern',
  PAYMENT: 'Payment problem',
  OTHER: 'Something else',
}

export const DISPUTE_OUTCOME_LABELS: Record<string, string> = {
  CUSTOMER_FAVOUR: 'Resolved in the customer’s favour',
  WORKER_FAVOUR: 'Resolved in the professional’s favour',
  SPLIT: 'Resolved with a partial refund',
  NO_ACTION: 'Closed without changes',
}
