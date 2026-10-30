import { describe, expect, it } from 'vitest'
import {
  BOOKING_TOPICS,
  draftAdminVerificationNotifications,
  draftNotifications,
  type BookingContext,
} from './templates'

const ctx: BookingContext = {
  bookingId: 'b1',
  code: 'KMC-ABC234',
  serviceName: 'Tap repair',
  customerUserId: 'cust',
  customerFirstName: 'Priya',
  workerUserId: 'work',
  workerFirstName: 'Rakesh',
  invitationId: 'inv1',
  totalPaise: 65_000,
  offer: null,
  charge: null,
}

const recipients = (topic: string, payload: Record<string, unknown> = {}, c = ctx) =>
  draftNotifications(topic, payload, c).map((n) => n.userId)

describe('draftNotifications', () => {
  it('tells the other side about an offer, linking to their own page', () => {
    const fromWorker = draftNotifications(
      'offer.created',
      {},
      { ...ctx, offer: { offeredBy: 'WORKER', amountPaise: 45_000 } },
    )
    expect(fromWorker).toEqual([
      {
        userId: 'cust',
        type: 'offer.created',
        title: 'Rakesh offered ₹450',
        body: 'Tap repair · KMC-ABC234',
        link: '/bookings/b1/negotiate',
      },
    ])
    const fromCustomer = draftNotifications(
      'offer.created',
      {},
      { ...ctx, offer: { offeredBy: 'CUSTOMER', amountPaise: 30_000 } },
    )
    expect(fromCustomer[0]).toMatchObject({ userId: 'work', link: '/worker/requests/inv1' })
  })

  it('tells the offer author when it is declined', () => {
    const offer = { offeredBy: 'CUSTOMER' as const, amountPaise: 30_000 }
    expect(recipients('offer.rejected', {}, { ...ctx, offer })).toEqual(['cust'])
  })

  it('never notifies people about their own action', () => {
    expect(recipients('booking.confirmed', { by: 'WORKER' })).toEqual(['cust'])
    expect(recipients('booking.confirmed', { by: 'CUSTOMER' })).toEqual(['work'])
    expect(recipients('booking.cancelled', { by: 'CUSTOMER' })).toEqual(['work'])
    expect(recipients('booking.cancelled', { by: 'WORKER' })).toEqual(['cust'])
    for (const topic of ['booking.en_route', 'booking.arrived', 'booking.in_progress']) {
      expect(recipients(topic)).toEqual(['cust'])
    }
  })

  it('tells both sides about system and admin changes', () => {
    expect(recipients('booking.expired')).toEqual(['cust', 'work'])
    expect(recipients('booking.cancelled', { by: 'ADMIN' })).toEqual(['cust', 'work'])
  })

  it('describes charges and totals', () => {
    const charge = { description: 'New cartridge', amountPaise: 15_000 }
    expect(draftNotifications('charge.proposed', {}, { ...ctx, charge })[0]).toMatchObject({
      userId: 'cust',
      body: 'New cartridge: ₹150. Approve or decline it.',
      link: '/bookings/b1',
    })
    expect(draftNotifications('charge.approved', {}, { ...ctx, charge })[0]).toMatchObject({
      userId: 'work',
      title: 'Priya approved your extra charge',
      link: '/worker/bookings/b1',
    })
    expect(draftNotifications('booking.completed', {}, ctx)[0].body).toBe('Total ₹650 · KMC-ABC234')
  })

  it('routes payments and reviews to the right person', () => {
    const cash = { provider: 'CASH', amountPaise: 65_000 }
    expect(draftNotifications('payment.cash_pending', cash, ctx)[0]).toMatchObject({
      userId: 'work',
      title: 'Priya will pay ₹650 in cash',
      link: '/worker/bookings/b1',
    })
    expect(recipients('payment.captured', cash)).toEqual(['cust'])
    expect(
      draftNotifications(
        'payment.captured',
        { provider: 'SIMULATED', amountPaise: 65_000 },
        ctx,
      )[0],
    ).toMatchObject({ userId: 'work', title: 'Priya paid ₹650 online', link: '/worker/earnings' })
    expect(draftNotifications('review.created', { rating: 4 }, ctx)[0].title).toBe(
      'Priya rated you 4★',
    )
    expect(draftNotifications('payment.captured', {}, ctx)).toEqual([])
  })

  it('drafts something for every booking topic it claims, and nothing for others', () => {
    const full = {
      ...ctx,
      offer: { offeredBy: 'WORKER' as const, amountPaise: 1 },
      charge: { description: 'x', amountPaise: 1 },
    }
    const payload = { amountPaise: 65_000, provider: 'SIMULATED', rating: 5 }
    for (const topic of BOOKING_TOPICS) {
      expect(draftNotifications(topic, payload, full).length, topic).toBeGreaterThan(0)
    }
    expect(draftNotifications('verification.submitted', {}, full)).toEqual([])
  })

  it('tells the professional about a visit fee when the customer cancels late', () => {
    expect(draftNotifications('booking.cancelled', { by: 'CUSTOMER' }, ctx)).toEqual([
      expect.objectContaining({ title: 'Priya cancelled', link: '/worker/requests/inv1' }),
    ])
    expect(
      draftNotifications('booking.cancelled', { by: 'CUSTOMER', visitFeePaise: 9_900 }, ctx),
    ).toEqual([
      expect.objectContaining({
        userId: 'work',
        title: 'Priya cancelled after you set off',
        body: 'Tap repair · KMC-ABC234 · they owe a ₹99 visit fee',
        link: '/worker/bookings/b1',
      }),
    ])
  })
})

describe('admin verification notifications', () => {
  it('goes to every admin and links to the application', () => {
    const drafts = draftAdminVerificationNotifications(['a1', 'a2'], {
      id: 'app1',
      workerName: 'Rakesh',
      resubmission: false,
    })
    expect(drafts).toEqual(
      ['a1', 'a2'].map((userId) => ({
        userId,
        type: 'verification.submitted',
        title: 'Rakesh submitted ID documents',
        body: 'Waiting for review.',
        link: '/admin/verifications/app1',
      })),
    )
    expect(
      draftAdminVerificationNotifications(['a1'], {
        id: 'app1',
        workerName: 'Rakesh',
        resubmission: true,
      })[0].title,
    ).toBe('Rakesh re-uploaded their ID documents')
    expect(
      draftAdminVerificationNotifications([], { id: 'x', workerName: 'R', resubmission: false }),
    ).toEqual([])
  })
})
