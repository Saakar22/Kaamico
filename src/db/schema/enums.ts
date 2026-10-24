import { pgEnum } from 'drizzle-orm/pg-core'

// Users and roles
export const userRole = pgEnum('user_role', ['CUSTOMER', 'WORKER', 'ADMIN'])
export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'DELETED'])
export const actorRole = pgEnum('actor_role', ['CUSTOMER', 'WORKER', 'ADMIN', 'SYSTEM'])

// Workers
export const workerVerificationStatus = pgEnum('worker_verification_status', [
  'UNVERIFIED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
])
export const pricingUnit = pgEnum('pricing_unit', [
  'PER_VISIT',
  'PER_HOUR',
  'PER_ITEM',
  'PER_SQFT',
  'FIXED',
])

// Locations
export const addressLabel = pgEnum('address_label', ['HOME', 'WORK', 'OTHER'])

// Bookings and negotiation
export const bookingMode = pgEnum('booking_mode', ['DIRECT', 'BROADCAST'])
export const bookingTiming = pgEnum('booking_timing', ['ON_DEMAND', 'SCHEDULED'])
export const bookingStatus = pgEnum('booking_status', [
  'REQUESTED',
  'NEGOTIATING',
  'CONFIRMED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
])
export const invitationStatus = pgEnum('invitation_status', [
  'INVITED',
  'SEEN',
  'QUOTED',
  'DECLINED',
  'EXPIRED',
  'WON',
  'LOST',
])
export const offerParty = pgEnum('offer_party', ['CUSTOMER', 'WORKER'])
export const offerStatus = pgEnum('offer_status', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'COUNTERED',
  'EXPIRED',
  'WITHDRAWN',
  'SUPERSEDED',
])
export const chargeKind = pgEnum('charge_kind', ['MATERIALS', 'EXTRA_WORK', 'OTHER'])
export const chargeStatus = pgEnum('charge_status', [
  'PROPOSED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
])

// Money
export const paymentProvider = pgEnum('payment_provider', ['CASH', 'SIMULATED', 'RAZORPAY'])
export const paymentStatus = pgEnum('payment_status', [
  'CREATED',
  'PENDING',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'CANCELLED',
])
export const refundStatus = pgEnum('refund_status', ['REQUESTED', 'PROCESSED', 'FAILED'])
export const ledgerEntryType = pgEnum('ledger_entry_type', [
  'JOB_EARNING',
  'COMMISSION',
  'CASH_COLLECTED',
  'ADJUSTMENT',
  'REFUND_CLAWBACK',
  'PAYOUT',
])
export const payoutStatus = pgEnum('payout_status', ['REQUESTED', 'PROCESSING', 'PAID', 'FAILED'])
export const payoutMode = pgEnum('payout_mode', ['SIMULATED', 'BANK', 'UPI'])

// Trust and safety
export const reviewStatus = pgEnum('review_status', ['PUBLISHED', 'HIDDEN', 'FLAGGED'])
export const verificationApplicationStatus = pgEnum('verification_application_status', [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'RESUBMISSION_REQUESTED',
])
export const verificationDocumentType = pgEnum('verification_document_type', [
  'AADHAAR_MASKED',
  'PAN',
  'VOTER_ID',
  'DRIVING_LICENCE',
  'SELFIE',
  'SKILL_CERTIFICATE',
  'POLICE_VERIFICATION',
])
export const ticketStatus = pgEnum('ticket_status', ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
export const disputeReason = pgEnum('dispute_reason', [
  'NO_SHOW',
  'POOR_QUALITY',
  'OVERCHARGE',
  'DAMAGE',
  'SAFETY',
  'PAYMENT',
  'OTHER',
])
export const disputeStatus = pgEnum('dispute_status', [
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED',
  'REJECTED',
])
export const disputeOutcome = pgEnum('dispute_outcome', [
  'CUSTOMER_FAVOUR',
  'WORKER_FAVOUR',
  'SPLIT',
  'NO_ACTION',
])

/** Statuses during which a confirmed booking occupies the worker's time. */
export const ACTIVE_BOOKING_STATUSES = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] as const
