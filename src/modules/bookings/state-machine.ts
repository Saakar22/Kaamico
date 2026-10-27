/**
 * The booking lifecycle (IMPLEMENTATION_PLAN.md §11.3) as one table. The API and the
 * tests both read this, so they cannot drift apart.
 */

export const BOOKING_STATUSES = [
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
] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]
export type TransitionActor = 'CUSTOMER' | 'WORKER' | 'ADMIN' | 'SYSTEM'

type Rule = { from: BookingStatus; to: BookingStatus; by: readonly TransitionActor[] }

export const TRANSITIONS: readonly Rule[] = [
  { from: 'REQUESTED', to: 'NEGOTIATING', by: ['CUSTOMER', 'WORKER'] },
  { from: 'REQUESTED', to: 'CONFIRMED', by: ['WORKER'] },
  { from: 'NEGOTIATING', to: 'CONFIRMED', by: ['CUSTOMER', 'WORKER'] },
  { from: 'REQUESTED', to: 'EXPIRED', by: ['SYSTEM'] },
  { from: 'NEGOTIATING', to: 'EXPIRED', by: ['SYSTEM'] },
  { from: 'REQUESTED', to: 'CANCELLED', by: ['CUSTOMER', 'SYSTEM', 'ADMIN'] },
  { from: 'NEGOTIATING', to: 'CANCELLED', by: ['CUSTOMER', 'SYSTEM', 'ADMIN'] },
  { from: 'CONFIRMED', to: 'EN_ROUTE', by: ['WORKER'] },
  { from: 'CONFIRMED', to: 'CANCELLED', by: ['CUSTOMER', 'WORKER', 'ADMIN'] },
  { from: 'EN_ROUTE', to: 'ARRIVED', by: ['WORKER'] },
  { from: 'EN_ROUTE', to: 'CANCELLED', by: ['CUSTOMER', 'ADMIN'] },
  { from: 'ARRIVED', to: 'IN_PROGRESS', by: ['WORKER'] },
  { from: 'ARRIVED', to: 'CANCELLED', by: ['CUSTOMER', 'WORKER', 'ADMIN'] },
  { from: 'IN_PROGRESS', to: 'COMPLETED', by: ['WORKER'] },
  // Admins can cancel any non-terminal booking (with a reason).
  { from: 'IN_PROGRESS', to: 'CANCELLED', by: ['ADMIN'] },
  { from: 'IN_PROGRESS', to: 'DISPUTED', by: ['CUSTOMER', 'WORKER'] },
  { from: 'COMPLETED', to: 'DISPUTED', by: ['CUSTOMER', 'WORKER'] },
  { from: 'DISPUTED', to: 'COMPLETED', by: ['ADMIN'] },
  { from: 'DISPUTED', to: 'CANCELLED', by: ['ADMIN'] },
  // A rejected report on a job still in progress hands the job back to the professional.
  { from: 'DISPUTED', to: 'IN_PROGRESS', by: ['ADMIN'] },
]

export const TERMINAL: readonly BookingStatus[] = ['COMPLETED', 'CANCELLED', 'EXPIRED']

/** Open requests: not yet confirmed, still waiting on one side. */
export const OPEN_REQUEST: readonly BookingStatus[] = ['REQUESTED', 'NEGOTIATING']

/** Confirmed and not finished: the worker's time is reserved. */
export const ACTIVE_JOB: readonly BookingStatus[] = [
  'CONFIRMED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
]

export function canTransition(
  from: BookingStatus,
  to: BookingStatus,
  by: TransitionActor,
): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to && t.by.includes(by))
}

/** Statuses the worker moves a job through with POST /transitions. */
export const WORKER_STEPS: Partial<Record<BookingStatus, BookingStatus>> = {
  CONFIRMED: 'EN_ROUTE',
  EN_ROUTE: 'ARRIVED',
  ARRIVED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
}
