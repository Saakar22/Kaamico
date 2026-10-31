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

const TICKET_CATEGORY_LABELS_HI: Record<TicketCategory, string> = {
  BOOKING: 'कोई बुकिंग',
  PAYMENT: 'भुगतान या रिफ़ंड',
  SAFETY: 'सुरक्षा से जुड़ी चिंता',
  ACCOUNT: 'मेरा खाता',
  VERIFICATION: 'ID जाँच',
  OTHER: 'कुछ और',
}

/** The topic in the reader's language (the admin console always reads English). */
export const ticketCategoryLabel = (category: TicketCategory, locale: 'en' | 'hi' = 'en') =>
  (locale === 'hi' ? TICKET_CATEGORY_LABELS_HI : TICKET_CATEGORY_LABELS)[category]
