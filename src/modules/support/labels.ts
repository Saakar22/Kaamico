/** Help-request topics. Client-safe (used by the ticket form). */

export const TICKET_CATEGORIES = [
  'BOOKING',
  'PAYMENT',
  'SAFETY',
  'ACCOUNT',
  'VERIFICATION',
  'OTHER',
] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]
export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  BOOKING: 'A booking',
  PAYMENT: 'Payment or refund',
  SAFETY: 'Safety concern',
  ACCOUNT: 'My account',
  VERIFICATION: 'ID verification',
  OTHER: 'Something else',
}
