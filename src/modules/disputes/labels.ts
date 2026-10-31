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

const DISPUTE_REASON_LABELS_HI: Record<DisputeReason, string> = {
  NO_SHOW: 'कोई नहीं आया',
  POOR_QUALITY: 'काम ठीक से नहीं हुआ',
  OVERCHARGE: 'तय से ज़्यादा पैसे लिए',
  DAMAGE: 'कुछ नुकसान हुआ',
  SAFETY: 'सुरक्षा से जुड़ी चिंता',
  PAYMENT: 'भुगतान में समस्या',
  OTHER: 'कुछ और',
}

/** The reason in the reader's language (the admin console always reads English). */
export const disputeReasonLabel = (reason: DisputeReason, locale: 'en' | 'hi' = 'en') =>
  (locale === 'hi' ? DISPUTE_REASON_LABELS_HI : DISPUTE_REASON_LABELS)[reason]

export const DISPUTE_OUTCOME_LABELS: Record<string, string> = {
  CUSTOMER_FAVOUR: 'Resolved in the customer’s favour',
  WORKER_FAVOUR: 'Resolved in the professional’s favour',
  SPLIT: 'Resolved with a partial refund',
  NO_ACTION: 'Closed without changes',
}

const DISPUTE_OUTCOME_LABELS_HI: Record<string, string> = {
  CUSTOMER_FAVOUR: 'ग्राहक के पक्ष में सुलझाया गया',
  WORKER_FAVOUR: 'प्रोफ़ेशनल के पक्ष में सुलझाया गया',
  SPLIT: 'आंशिक रिफ़ंड के साथ सुलझाया गया',
  NO_ACTION: 'बिना बदलाव के बंद किया गया',
}

export const disputeOutcomeLabel = (outcome: string, locale: 'en' | 'hi' = 'en') =>
  (locale === 'hi' ? DISPUTE_OUTCOME_LABELS_HI : DISPUTE_OUTCOME_LABELS)[outcome] ?? outcome
