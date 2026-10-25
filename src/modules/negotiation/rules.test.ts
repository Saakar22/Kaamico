import { describe, expect, it } from 'vitest'
import { fromIst } from '@/lib/time'
import { deriveStartCode, hashStartCode, startCodeMatches } from '@/modules/bookings/start-code'
import {
  ACTIVE_JOB,
  BOOKING_STATUSES,
  canTransition,
  TERMINAL,
  TRANSITIONS,
} from '@/modules/bookings/state-machine'
import {
  assertOfferAllowed,
  customerFloor,
  isFinalOffer,
  maskContactDetails,
  offerExpiry,
  requestExpiry,
  type ThreadOffer,
} from './rules'

const terms = { listedPricePaise: 60000, minChargePaise: 20000, negotiable: true }
const offer = (
  offeredBy: 'CUSTOMER' | 'WORKER',
  amountPaise: number,
  status = 'COUNTERED',
): ThreadOffer => ({
  offeredBy,
  amountPaise,
  status,
})
const check =
  (party: 'CUSTOMER' | 'WORKER', amountPaise: number, thread: ThreadOffer[] = [], note?: string) =>
  () =>
    assertOfferAllowed({ party, amountPaise, thread, terms, note })
const code = (fn: () => void) => {
  try {
    fn()
    return 'OK'
  } catch (e) {
    return (e as { code: string }).code
  }
}

describe('negotiation rules', () => {
  it('sets the customer floor at the minimum charge or 40% of the listed price', () => {
    expect(customerFloor(terms)).toBe(24000)
    expect(customerFloor({ ...terms, minChargePaise: 30000 })).toBe(30000)
    expect(code(check('CUSTOMER', 23999))).toBe('OFFER_BELOW_FLOOR')
    expect(code(check('CUSTOMER', 24000))).toBe('OK')
  })

  it('enforces turn-taking: no new offer while your own is pending', () => {
    expect(code(check('CUSTOMER', 50000, [offer('CUSTOMER', 45000, 'PENDING')]))).toBe(
      'NOT_YOUR_TURN',
    )
    expect(code(check('WORKER', 55000, [offer('CUSTOMER', 45000, 'PENDING')]))).toBe('OK')
  })

  it('limits each side to 3 offers and the thread to 6', () => {
    const thread = [
      offer('CUSTOMER', 40000),
      offer('WORKER', 58000),
      offer('CUSTOMER', 45000),
      offer('WORKER', 56000),
      offer('CUSTOMER', 48000),
    ]
    expect(code(check('CUSTOMER', 50000, thread))).toBe('ROUND_LIMIT')
    expect(code(check('WORKER', 54000, thread))).toBe('OK')
    expect(code(check('WORKER', 54000, [...thread, offer('WORKER', 55000)]))).toBe('ROUND_LIMIT')
  })

  it('labels the last allowed offer as final', () => {
    expect(isFinalOffer([offer('CUSTOMER', 1), offer('WORKER', 1)], 'CUSTOMER')).toBe(false)
    expect(
      isFinalOffer(
        [offer('CUSTOMER', 1), offer('WORKER', 1), offer('CUSTOMER', 1), offer('WORKER', 1)],
        'CUSTOMER',
      ),
    ).toBe(true)
  })

  it('keeps offers monotonic: customers never go down, workers never go up', () => {
    const thread = [offer('CUSTOMER', 45000), offer('WORKER', 56000)]
    expect(code(check('CUSTOMER', 44000, thread))).toBe('OFFER_NOT_MONOTONIC')
    expect(code(check('CUSTOMER', 45000, thread))).toBe('OK')
    const workerThread = [...thread, offer('CUSTOMER', 47000)]
    expect(code(check('WORKER', 57000, workerThread))).toBe('OFFER_NOT_MONOTONIC')
    expect(code(check('WORKER', 52000, workerThread))).toBe('OK')
  })

  it('respects fixed prices and the listed price as the customer ceiling', () => {
    const fixed = { ...terms, negotiable: false }
    expect(
      code(() =>
        assertOfferAllowed({ party: 'CUSTOMER', amountPaise: 55000, thread: [], terms: fixed }),
      ),
    ).toBe('NOT_NEGOTIABLE')
    expect(
      code(() =>
        assertOfferAllowed({ party: 'CUSTOMER', amountPaise: 60000, thread: [], terms: fixed }),
      ),
    ).toBe('OK')
    expect(code(check('CUSTOMER', 61000))).toBe('OFFER_ABOVE_LISTED')
  })

  it('asks workers for a reason when quoting far above their listed price', () => {
    expect(code(check('WORKER', 90001))).toBe('NOTE_REQUIRED')
    expect(code(check('WORKER', 90001, [], 'Two taps, not one'))).toBe('OK')
    expect(code(check('WORKER', 90000))).toBe('OK')
  })

  it('rejects nonsense amounts', () => {
    expect(code(check('CUSTOMER', 0))).toBe('VALIDATION_FAILED')
    expect(code(check('CUSTOMER', 450.5))).toBe('VALIDATION_FAILED')
  })
})

describe('expiry', () => {
  const now = fromIst(2026, 10, 26, 10 * 60)
  it('gives on-demand requests 30 minutes and offers 10', () => {
    const request = requestExpiry('ON_DEMAND', now, now)
    expect(request.getTime() - now.getTime()).toBe(30 * 60_000)
    expect(offerExpiry('ON_DEMAND', now, request, now).getTime() - now.getTime()).toBe(10 * 60_000)
  })

  it('closes scheduled requests an hour before the start and offers 2 hours before, at most 6 hours out', () => {
    const start = fromIst(2026, 10, 28, 11 * 60)
    const request = requestExpiry('SCHEDULED', start, now)
    expect(request.toISOString()).toBe(fromIst(2026, 10, 28, 10 * 60).toISOString())
    expect(offerExpiry('SCHEDULED', start, request, now).toISOString()).toBe(
      fromIst(2026, 10, 26, 16 * 60).toISOString(),
    )
    const soon = fromIst(2026, 10, 26, 13 * 60)
    expect(
      offerExpiry('SCHEDULED', soon, requestExpiry('SCHEDULED', soon, now), now).toISOString(),
    ).toBe(fromIst(2026, 10, 26, 11 * 60).toISOString())
  })
})

describe('contact masking', () => {
  it.each([
    ['Call me on 98765 43210', 'Call me on [hidden]'],
    ['+91-98765-43210 anytime', '[hidden] anytime'],
    ['pay to rakesh.p@okaxis', 'pay to [hidden]'],
    ['mail me at a.b@example.com', 'mail me at [hidden]'],
  ])('masks %s', (input, expected) => {
    expect(maskContactDetails(input)).toEqual({ text: expected, redacted: true })
  })

  it('leaves ordinary messages and prices alone', () => {
    expect(maskContactDetails('Can you do it for ₹450 by 5 pm?')).toEqual({
      text: 'Can you do it for ₹450 by 5 pm?',
      redacted: false,
    })
  })
})

describe('start codes', () => {
  it('derives a stable 4-digit code and checks it in constant time', () => {
    const c = deriveStartCode('booking-1', 'secret')
    expect(c).toMatch(/^\d{4}$/)
    expect(deriveStartCode('booking-1', 'secret')).toBe(c)
    expect(deriveStartCode('booking-2', 'secret')).not.toBe(deriveStartCode('booking-3', 'secret'))
    const hash = hashStartCode('booking-1', c)
    expect(startCodeMatches('booking-1', c, hash)).toBe(true)
    expect(startCodeMatches('booking-1', c === '0000' ? '0001' : '0000', hash)).toBe(false)
    expect(startCodeMatches('booking-1', 'abcd', hash)).toBe(false)
  })
})

describe('state machine table', () => {
  it('has no transitions out of terminal states except a dispute on a completed job', () => {
    for (const t of TRANSITIONS) {
      if (TERMINAL.includes(t.from)) expect([t.from, t.to]).toEqual(['COMPLETED', 'DISPUTED'])
    }
  })

  it('only lets the worker move a job forward, and only one step at a time', () => {
    expect(canTransition('CONFIRMED', 'EN_ROUTE', 'WORKER')).toBe(true)
    expect(canTransition('CONFIRMED', 'ARRIVED', 'WORKER')).toBe(false)
    expect(canTransition('CONFIRMED', 'EN_ROUTE', 'CUSTOMER')).toBe(false)
    expect(canTransition('IN_PROGRESS', 'COMPLETED', 'WORKER')).toBe(true)
    expect(canTransition('IN_PROGRESS', 'CANCELLED', 'CUSTOMER')).toBe(false)
  })

  it('covers every status', () => {
    const touched = new Set(TRANSITIONS.flatMap((t) => [t.from, t.to]))
    expect([...touched].sort()).toEqual([...BOOKING_STATUSES].sort())
    expect(
      ACTIVE_JOB.every((s) => TRANSITIONS.some((t) => t.from === s && t.to === 'CANCELLED')),
    ).toBe(true)
  })
})
