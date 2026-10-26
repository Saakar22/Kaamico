import { formatINR } from '@/lib/money'

/**
 * Turns an outbox event into in-app notifications (IMPLEMENTATION_PLAN.md §10.12). Pure:
 * the dispatcher loads the booking context, so every message can be unit-tested.
 * Nobody is told about their own action.
 */

export type BookingContext = {
  bookingId: string
  code: string
  serviceName: string
  customerUserId: string
  customerFirstName: string
  workerUserId: string
  workerFirstName: string
  invitationId: string
  totalPaise: number | null
  /** The offer named in the payload, if any. */
  offer: { offeredBy: 'CUSTOMER' | 'WORKER'; amountPaise: number } | null
  /** The charge named in the payload, if any. */
  charge: { description: string; amountPaise: number } | null
}

export type NotificationDraft = {
  userId: string
  type: string
  title: string
  body: string | null
  link: string
}

const customerLinks = (c: BookingContext) => ({
  thread: `/bookings/${c.bookingId}/negotiate`,
  booking: `/bookings/${c.bookingId}`,
})
const workerLinks = (c: BookingContext) => ({
  request: `/worker/requests/${c.invitationId}`,
  job: `/worker/bookings/${c.bookingId}`,
})

export function draftNotifications(
  topic: string,
  payload: Record<string, unknown>,
  c: BookingContext,
): NotificationDraft[] {
  const toCustomer = (title: string, body: string | null, link: string) => ({
    userId: c.customerUserId,
    type: topic,
    title,
    body,
    link,
  })
  const toWorker = (title: string, body: string | null, link: string) => ({
    userId: c.workerUserId,
    type: topic,
    title,
    body,
    link,
  })
  const cust = customerLinks(c)
  const work = workerLinks(c)
  const ref = `${c.serviceName} · ${c.code}`

  switch (topic) {
    case 'booking.requested':
      return [
        toWorker(
          `New request: ${c.serviceName}`,
          `From ${c.customerFirstName} · ${c.code}`,
          work.request,
        ),
      ]

    case 'offer.created': {
      if (!c.offer) return []
      const amount = formatINR(c.offer.amountPaise)
      return c.offer.offeredBy === 'WORKER'
        ? [toCustomer(`${c.workerFirstName} offered ${amount}`, ref, cust.thread)]
        : [toWorker(`${c.customerFirstName} offered ${amount}`, ref, work.request)]
    }

    case 'offer.rejected': {
      if (!c.offer) return []
      const amount = formatINR(c.offer.amountPaise)
      return c.offer.offeredBy === 'WORKER'
        ? [toWorker(`${c.customerFirstName} declined ${amount}`, ref, work.request)]
        : [toCustomer(`${c.workerFirstName} declined ${amount}`, ref, cust.thread)]
    }

    case 'booking.confirmed': {
      const out: NotificationDraft[] = []
      if (payload.by !== 'CUSTOMER')
        out.push(toCustomer(`${c.workerFirstName} confirmed your booking`, ref, cust.booking))
      if (payload.by !== 'WORKER')
        out.push(toWorker(`${c.customerFirstName} confirmed the job`, ref, work.job))
      return out
    }

    case 'booking.en_route':
      return [toCustomer(`${c.workerFirstName} is on the way`, ref, cust.booking)]
    case 'booking.arrived':
      return [
        toCustomer(
          `${c.workerFirstName} has arrived`,
          'Share your start code so the job can begin.',
          cust.booking,
        ),
      ]
    case 'booking.in_progress':
      return [toCustomer('Work has started', ref, cust.booking)]
    case 'booking.completed':
      return [
        toCustomer(
          'Job completed',
          c.totalPaise !== null ? `Total ${formatINR(c.totalPaise)} · ${c.code}` : ref,
          cust.booking,
        ),
      ]

    case 'charge.proposed':
      if (!c.charge) return []
      return [
        toCustomer(
          `${c.workerFirstName} added an extra charge`,
          `${c.charge.description}: ${formatINR(c.charge.amountPaise)}. Approve or decline it.`,
          cust.booking,
        ),
      ]
    case 'charge.approved':
    case 'charge.rejected':
      if (!c.charge) return []
      return [
        toWorker(
          `${c.customerFirstName} ${topic === 'charge.approved' ? 'approved' : 'declined'} your extra charge`,
          `${c.charge.description}: ${formatINR(c.charge.amountPaise)}`,
          work.job,
        ),
      ]

    case 'booking.cancelled':
      if (payload.by === 'WORKER')
        return [toCustomer(`${c.workerFirstName} cancelled your booking`, ref, cust.booking)]
      if (payload.by === 'CUSTOMER')
        return [toWorker(`${c.customerFirstName} cancelled`, ref, work.request)]
      return [
        toCustomer('Your booking was cancelled', ref, cust.booking),
        toWorker('A job was cancelled', ref, work.request),
      ]
    case 'request.declined':
      return [
        toCustomer(
          `${c.workerFirstName} can't take this job`,
          'Ask another professional nearby.',
          cust.booking,
        ),
      ]
    case 'booking.expired':
      return [
        toCustomer('Your request expired', `No price was agreed in time · ${c.code}`, cust.booking),
        toWorker('A request expired', ref, work.request),
      ]

    default:
      return []
  }
}

/** Topics about one booking; everything else is skipped for now (e.g. verification, Phase 9). */
export const BOOKING_TOPICS = new Set([
  'booking.requested',
  'offer.created',
  'offer.rejected',
  'booking.confirmed',
  'booking.en_route',
  'booking.arrived',
  'booking.in_progress',
  'booking.completed',
  'charge.proposed',
  'charge.approved',
  'charge.rejected',
  'booking.cancelled',
  'request.declined',
  'booking.expired',
])

/** The professional hears about the review of their ID verification. */
export function draftVerificationNotification(
  decision: unknown,
  workerUserId: string,
  reason: string | null,
): NotificationDraft | null {
  const base = { userId: workerUserId, type: 'verification.decided', link: '/worker/verification' }
  switch (decision) {
    case 'APPROVE':
      return {
        ...base,
        title: "You're verified",
        body: 'Customers near you can now find and book you. Go online to get requests.',
        link: '/worker/dashboard',
      }
    case 'REJECT':
      return { ...base, title: 'Your ID verification was not approved', body: reason }
    case 'REQUEST_RESUBMISSION':
      return { ...base, title: 'Please upload your documents again', body: reason }
    default:
      return null
  }
}
