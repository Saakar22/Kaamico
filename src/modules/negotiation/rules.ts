import { AppError, businessRule, conflict } from '@/lib/errors'
import { negotiationConfig as config } from './config'

export type Party = 'CUSTOMER' | 'WORKER'

export type ThreadOffer = {
  offeredBy: Party
  amountPaise: number
  status: string
}

export type PricingTerms = {
  listedPricePaise: number
  minChargePaise: number
  negotiable: boolean
}

/** The least a customer may offer: max(minimum charge, 40% of the listed price). */
export function customerFloor(terms: PricingTerms): number {
  return Math.max(
    terms.minChargePaise,
    Math.ceil((terms.listedPricePaise * config.floorPercentOfListed) / 100),
  )
}

/**
 * Checks a new offer against the thread so far. Throws the API error to return;
 * every rule here is covered by `rules.test.ts`.
 */
export function assertOfferAllowed(input: {
  party: Party
  amountPaise: number
  note?: string | null
  thread: readonly ThreadOffer[]
  terms: PricingTerms
}): void {
  const { party, amountPaise, thread, terms } = input
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new AppError('VALIDATION_FAILED', 'Enter a valid amount')
  }
  if (thread.some((o) => o.offeredBy === party && o.status === 'PENDING')) {
    throw conflict(
      'NOT_YOUR_TURN',
      'Your offer is still waiting for a reply. Withdraw it to change it.',
    )
  }
  const own = thread.filter((o) => o.offeredBy === party)
  if (thread.length >= config.maxOffers || own.length >= config.maxOffersPerSide) {
    throw businessRule('ROUND_LIMIT', 'No more offers can be made on this request')
  }

  if (party === 'CUSTOMER') {
    if (!terms.negotiable && amountPaise !== terms.listedPricePaise) {
      throw businessRule('NOT_NEGOTIABLE', 'This professional has a fixed price for this service', {
        listedPricePaise: terms.listedPricePaise,
      })
    }
    const floor = customerFloor(terms)
    if (amountPaise < floor) {
      throw businessRule('OFFER_BELOW_FLOOR', 'This offer is too low for this service', {
        floorPaise: floor,
      })
    }
    if (amountPaise > terms.listedPricePaise) {
      throw businessRule('OFFER_ABOVE_LISTED', 'You can accept the listed price instead', {
        listedPricePaise: terms.listedPricePaise,
      })
    }
    const previous = Math.max(0, ...own.map((o) => o.amountPaise))
    if (amountPaise < previous) {
      throw businessRule('OFFER_NOT_MONOTONIC', 'You cannot offer less than you offered before', {
        previousPaise: previous,
      })
    }
  } else {
    const previous = Math.min(Number.MAX_SAFE_INTEGER, ...own.map((o) => o.amountPaise))
    if (amountPaise > previous) {
      throw businessRule('OFFER_NOT_MONOTONIC', 'You cannot ask for more than you asked before', {
        previousPaise: previous,
      })
    }
    const ceiling = (terms.listedPricePaise * config.noteRequiredAbovePercent) / 100
    if (amountPaise > ceiling && !input.note?.trim()) {
      throw businessRule('NOTE_REQUIRED', 'Explain why this quote is well above your listed price')
    }
  }
}

/** True when this offer is the last one allowed for its side (shown as "Final offer"). */
export function isFinalOffer(thread: readonly ThreadOffer[], party: Party): boolean {
  const own = thread.filter((o) => o.offeredBy === party).length
  return own + 1 >= config.maxOffersPerSide || thread.length + 1 >= config.maxOffers
}

const MINUTE = 60_000

/** When a request lapses if nobody confirms it. */
export function requestExpiry(timing: 'ON_DEMAND' | 'SCHEDULED', start: Date, now: Date): Date {
  return timing === 'ON_DEMAND'
    ? new Date(now.getTime() + config.requestTtl.onDemandMinutes * MINUTE)
    : new Date(start.getTime() - config.requestTtl.scheduledCutoffMinutes * MINUTE)
}

/** When a new offer lapses: short for on-demand jobs, and never after the request itself. */
export function offerExpiry(
  timing: 'ON_DEMAND' | 'SCHEDULED',
  start: Date,
  requestExpiresAt: Date,
  now: Date,
): Date {
  const { onDemandMinutes, scheduledHours, scheduledCutoffMinutes } = config.offerTtl
  const own =
    timing === 'ON_DEMAND'
      ? now.getTime() + onDemandMinutes * MINUTE
      : Math.min(
          now.getTime() + scheduledHours * 60 * MINUTE,
          start.getTime() - scheduledCutoffMinutes * MINUTE,
        )
  return new Date(Math.min(own, requestExpiresAt.getTime()))
}

/** Masks phone numbers, UPI IDs and email addresses in negotiation messages. */
export function maskContactDetails(body: string): { text: string; redacted: boolean } {
  const patterns = [
    /[\w.+-]{2,}@[a-z][\w-]*(\.[a-z][\w-]*)*/gi, // UPI handles and emails
    /(?:\+?91[\s-]*)?[6-9](?:[\s-]*\d){9}/g, // Indian mobile numbers, with or without spaces
    /\d(?:[\s-]*\d){7,}/g, // any other long run of digits
  ]
  let text = body
  for (const p of patterns) text = text.replace(p, '[hidden]')
  return { text, redacted: text !== body }
}
