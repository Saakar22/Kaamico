/**
 * Worker earnings arithmetic (IMPLEMENTATION_PLAN.md §11.4). Pure and integer-only, so
 * the ledger, the receipts and the earnings page all agree to the paisa.
 */

export type PaymentMethod = 'CASH' | 'SIMULATED' | 'RAZORPAY'
export type PostingType = 'JOB_EARNING' | 'COMMISSION' | 'CASH_COLLECTED'
export type Posting = { type: PostingType; amountPaise: number }

/** Platform fee on `grossPaise`, rounded half up to a whole paisa. */
export function commissionOf(grossPaise: number, commissionBps: number): number {
  if (!Number.isInteger(grossPaise) || grossPaise < 0)
    throw new RangeError('gross must be whole paise')
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new RangeError('commission must be 0–10000 bps')
  }
  // Integer maths: (gross × bps + 5000) ÷ 10000, floored, is round-half-up without floats.
  return Math.floor((grossPaise * commissionBps + 5_000) / 10_000)
}

/**
 * Ledger entries for a captured payment. Online: the platform holds the money and owes
 * the professional gross − commission. Cash: the professional already holds the gross,
 * so they owe the commission (a negative balance netted against later online jobs).
 */
export function postingsFor(input: {
  grossPaise: number
  commissionBps: number
  method: PaymentMethod
}): Posting[] {
  const commission = commissionOf(input.grossPaise, input.commissionBps)
  const postings: Posting[] = [{ type: 'JOB_EARNING', amountPaise: input.grossPaise }]
  if (commission > 0) postings.push({ type: 'COMMISSION', amountPaise: -commission })
  if (input.method === 'CASH') {
    postings.push({ type: 'CASH_COLLECTED', amountPaise: -input.grossPaise })
  }
  return postings
}

/** What the professional keeps from a job, whatever the payment method. */
export function netOf(grossPaise: number, commissionBps: number): number {
  return grossPaise - commissionOf(grossPaise, commissionBps)
}
