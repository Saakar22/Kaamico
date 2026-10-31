import type { Locale } from '@/i18n/config'
import { en } from '@/i18n/messages/en'
import { hi } from '@/i18n/messages/hi'
import { createTranslator, type Translate } from '@/i18n/translate'
import { formatINR } from '@/lib/money'

/**
 * Turns an outbox event into in-app notifications (IMPLEMENTATION_PLAN.md §10.12). Pure:
 * the dispatcher loads the booking context, so every message can be unit-tested.
 * Nobody is told about their own action. Each person reads it in their own language.
 */

const translators: Record<Locale, Translate> = {
  en: createTranslator(en),
  hi: createTranslator(hi),
}

export type BookingContext = {
  bookingId: string
  code: string
  serviceName: string
  /** The service's Hindi name, when it has one. */
  serviceNameHi?: string | null
  customerUserId: string
  customerFirstName: string
  /** The customer's chosen language (English when absent). */
  customerLocale?: Locale
  workerUserId: string
  workerFirstName: string
  workerLocale?: Locale
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
  /** One side of the booking: who, their translator, and the service in their language. */
  const side = (userId: string, locale: Locale = 'en') => {
    const service = locale === 'hi' && c.serviceNameHi ? c.serviceNameHi : c.serviceName
    return {
      t: translators[locale],
      service,
      ref: `${service} · ${c.code}`,
      send: (title: string, body: string | null, link: string): NotificationDraft => ({
        userId,
        type: topic,
        title,
        body,
        link,
      }),
    }
  }
  const C = side(c.customerUserId, c.customerLocale)
  const W = side(c.workerUserId, c.workerLocale)
  const customer = { name: c.customerFirstName }
  const worker = { name: c.workerFirstName }
  const cust = customerLinks(c)
  const work = workerLinks(c)

  switch (topic) {
    case 'booking.requested':
      return [
        payload.quickMatch
          ? W.send(
              W.t('notify.quickMatchTitle', { service: W.service }),
              W.t('notify.quickMatchBody', { ...customer, code: c.code }),
              work.request,
            )
          : W.send(
              W.t('notify.newRequestTitle', { service: W.service }),
              W.t('notify.newRequestBody', { ...customer, code: c.code }),
              work.request,
            ),
      ]
    case 'request.taken':
      return [W.send(W.t('notify.taken'), W.ref, work.request)]

    case 'offer.created': {
      if (!c.offer) return []
      const amount = formatINR(c.offer.amountPaise)
      return c.offer.offeredBy === 'WORKER'
        ? [C.send(C.t('notify.offered', { ...worker, amount }), C.ref, cust.thread)]
        : [W.send(W.t('notify.offered', { ...customer, amount }), W.ref, work.request)]
    }

    case 'offer.rejected': {
      if (!c.offer) return []
      const amount = formatINR(c.offer.amountPaise)
      return c.offer.offeredBy === 'WORKER'
        ? [W.send(W.t('notify.declinedOffer', { ...customer, amount }), W.ref, work.request)]
        : [C.send(C.t('notify.declinedOffer', { ...worker, amount }), C.ref, cust.thread)]
    }

    case 'booking.confirmed': {
      const out: NotificationDraft[] = []
      if (payload.by !== 'CUSTOMER')
        out.push(C.send(C.t('notify.confirmedYourBooking', worker), C.ref, cust.booking))
      if (payload.by !== 'WORKER')
        out.push(W.send(W.t('notify.confirmedTheJob', customer), W.ref, work.job))
      return out
    }

    case 'booking.en_route':
      return [C.send(C.t('notify.onTheWay', worker), C.ref, cust.booking)]
    case 'booking.arrived':
      return [C.send(C.t('notify.arrived', worker), C.t('notify.shareCode'), cust.booking)]
    case 'booking.in_progress':
      return [C.send(C.t('notify.started'), C.ref, cust.booking)]
    case 'booking.completed':
      return [
        C.send(
          C.t('notify.completed'),
          c.totalPaise !== null
            ? C.t('notify.total', { amount: formatINR(c.totalPaise), code: c.code })
            : C.ref,
          cust.booking,
        ),
      ]

    case 'charge.proposed':
      if (!c.charge) return []
      return [
        C.send(
          C.t('notify.chargeAdded', worker),
          C.t('notify.chargeBody', {
            description: c.charge.description,
            amount: formatINR(c.charge.amountPaise),
          }),
          cust.booking,
        ),
      ]
    case 'charge.approved':
    case 'charge.rejected':
      if (!c.charge) return []
      return [
        W.send(
          W.t(
            topic === 'charge.approved' ? 'notify.chargeApproved' : 'notify.chargeRejected',
            customer,
          ),
          W.t('notify.chargeLine', {
            description: c.charge.description,
            amount: formatINR(c.charge.amountPaise),
          }),
          work.job,
        ),
      ]

    case 'booking.cancelled':
      if (payload.by === 'WORKER')
        return [C.send(C.t('notify.cancelledYourBooking', worker), C.ref, cust.booking)]
      if (payload.by === 'CUSTOMER')
        return [
          Number.isInteger(payload.visitFeePaise)
            ? W.send(
                W.t('notify.cancelledAfterSetOff', customer),
                W.t('notify.owesVisitFee', {
                  ref: W.ref,
                  amount: formatINR(Number(payload.visitFeePaise)),
                }),
                work.job,
              )
            : W.send(W.t('notify.cancelled', customer), W.ref, work.request),
        ]
      return [
        C.send(C.t('notify.yourBookingCancelled'), C.ref, cust.booking),
        W.send(W.t('notify.jobCancelled'), W.ref, work.request),
      ]
    case 'request.declined':
      return [C.send(C.t('notify.cantTake', worker), C.t('notify.askAnother'), cust.booking)]
    case 'booking.expired':
      return [
        C.send(
          C.t('notify.requestExpired'),
          C.t('notify.noPriceInTime', { code: c.code }),
          cust.booking,
        ),
        W.send(W.t('notify.aRequestExpired'), W.ref, work.request),
      ]

    case 'payment.cash_pending':
      if (!Number.isInteger(payload.amountPaise)) return []
      return [
        W.send(
          W.t('notify.willPayCash', {
            ...customer,
            amount: formatINR(Number(payload.amountPaise)),
          }),
          W.t('notify.confirmWhenReceived'),
          work.job,
        ),
      ]
    case 'payment.captured': {
      if (!Number.isInteger(payload.amountPaise)) return []
      const amount = formatINR(Number(payload.amountPaise))
      return payload.provider === 'CASH'
        ? [
            C.send(
              C.t('notify.cashConfirmed'),
              C.t('notify.cashTo', { amount, ...worker, code: c.code }),
              cust.booking,
            ),
          ]
        : [
            W.send(
              W.t('notify.paidOnline', { ...customer, amount }),
              payload.provider === 'SIMULATED'
                ? W.t('notify.simulatedEarnings')
                : W.t('notify.earnings'),
              '/worker/earnings',
            ),
          ]
    }
    case 'review.created':
      return [
        W.send(
          W.t('notify.ratedYou', { ...customer, rating: Number(payload.rating) }),
          W.ref,
          '/worker/reviews',
        ),
      ]
    case 'dispute.opened':
      return payload.raisedBy === 'WORKER'
        ? [
            C.send(
              C.t('notify.reportedProblem', worker),
              C.t('notify.willLookInto', { ref: C.ref }),
              cust.booking,
            ),
          ]
        : [
            W.send(
              W.t('notify.reportedProblem', customer),
              W.t('notify.willLookInto', { ref: W.ref }),
              work.job,
            ),
          ]
    case 'dispute.resolved': {
      const refund = Number(payload.refundPaise) || 0
      const body = (s: typeof C) =>
        refund > 0 ? s.t('notify.refundedRef', { ref: s.ref, amount: formatINR(refund) }) : s.ref
      return [
        C.send(C.t('notify.resolved'), body(C), cust.booking),
        W.send(W.t('notify.resolved'), body(W), work.job),
      ]
    }
    case 'payment.refunded': {
      // A refund from a dispute is announced with its resolution.
      if (payload.disputeId) return []
      const amount = formatINR(Number(payload.amountPaise))
      return [
        C.send(C.t('notify.refunded', { amount }), C.ref, cust.booking),
        W.send(
          W.t('notify.refundedTo', { amount, ...customer }),
          W.t('notify.seeEarnings', { ref: W.ref }),
          '/worker/earnings',
        ),
      ]
    }
    case 'review.replied':
      return [C.send(C.t('notify.replied', worker), C.ref, cust.booking)]

    default:
      return []
  }
}

/** Topics about one booking; verification and payout topics have their own drafts below. */
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
  'payment.cash_pending',
  'payment.captured',
  'review.created',
  'review.replied',
  'request.taken',
  'dispute.opened',
  'dispute.resolved',
  'payment.refunded',
])

/** The professional hears when a payout they asked for is paid or fails. */
export function draftPayoutNotification(
  topic: string,
  payout: { workerUserId: string; amountPaise: number; failureReason: string | null },
  locale: Locale = 'en',
): NotificationDraft | null {
  const t = translators[locale]
  const base = { userId: payout.workerUserId, type: topic, link: '/worker/earnings' }
  const amount = formatINR(payout.amountPaise)
  switch (topic) {
    case 'payout.paid':
      return {
        ...base,
        title: t('notify.payoutSent', { amount }),
        body: t('notify.payoutDemo'),
      }
    case 'payout.failed':
      return {
        ...base,
        title: t('notify.payoutFailed', { amount }),
        body: t('notify.payoutFailedBody', {
          reason: payout.failureReason ?? t('notify.itFailed'),
        }),
      }
    default:
      return null
  }
}

/** Every active admin hears when a professional's documents are waiting for review. */
export function draftAdminVerificationNotifications(
  adminUserIds: string[],
  application: { id: string; workerName: string; resubmission: boolean },
): NotificationDraft[] {
  const title = application.resubmission
    ? `${application.workerName} re-uploaded their ID documents`
    : `${application.workerName} submitted ID documents`
  return adminUserIds.map((userId) => ({
    userId,
    type: 'verification.submitted',
    title,
    body: 'Waiting for review.',
    link: `/admin/verifications/${application.id}`,
  }))
}

/** The professional hears about the review of their ID verification. */
export function draftVerificationNotification(
  decision: unknown,
  workerUserId: string,
  reason: string | null,
  locale: Locale = 'en',
): NotificationDraft | null {
  const t = translators[locale]
  const base = { userId: workerUserId, type: 'verification.decided', link: '/worker/verification' }
  switch (decision) {
    case 'APPROVE':
      return {
        ...base,
        title: t('notify.verified'),
        body: t('notify.verifiedBody'),
        link: '/worker/dashboard',
      }
    case 'REJECT':
      return { ...base, title: t('notify.notApproved'), body: reason }
    case 'REQUEST_RESUBMISSION':
      return { ...base, title: t('notify.uploadAgain'), body: reason }
    default:
      return null
  }
}
