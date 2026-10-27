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

export type RefundPosting = { type: 'REFUND_CLAWBACK' | 'ADJUSTMENT'; amountPaise: number }

/**
 * Ledger entries when `refundPaise` of a job is returned to the customer. The professional
 * gives back the refunded amount, and Kaamico returns the fee it no longer earns: the fee
 * always equals the fee on what the customer finally paid, across any number of partial
 * refunds (`refundedBeforePaise` = refunds already made).
 */
export function refundPostingsFor(input: {
  grossPaise: number
  commissionBps: number
  refundPaise: number
  refundedBeforePaise: number
}): RefundPosting[] {
  const { grossPaise, commissionBps, refundPaise, refundedBeforePaise } = input
  if (!Number.isInteger(refundPaise) || refundPaise <= 0) {
    throw new RangeError('refund must be whole positive paise')
  }
  if (refundedBeforePaise + refundPaise > grossPaise) {
    throw new RangeError('refunds cannot exceed the amount paid')
  }
  const remainingBefore = grossPaise - refundedBeforePaise
  const feeReturned =
    commissionOf(remainingBefore, commissionBps) -
    commissionOf(remainingBefore - refundPaise, commissionBps)
  const postings: RefundPosting[] = [{ type: 'REFUND_CLAWBACK', amountPaise: -refundPaise }]
  if (feeReturned > 0) postings.push({ type: 'ADJUSTMENT', amountPaise: feeReturned })
  return postings
}
