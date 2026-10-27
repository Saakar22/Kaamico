import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getEnv } from '@/config/env'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Razorpay (test mode) over its REST API: orders, refunds and signature checks
 * (IMPLEMENTATION_PLAN.md §13). Amounts are always integer paise, as Razorpay expects.
 */

const API = 'https://api.razorpay.com/v1'
const TIMEOUT_MS = 10_000

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string }

/** The configured keys; only available when PAYMENTS_MODE=razorpay (validated at boot). */
export function razorpayConfig(): RazorpayConfig {
  const env = getEnv()
  if (
    env.PAYMENTS_MODE !== 'razorpay' ||
    !env.RAZORPAY_KEY_ID ||
    !env.RAZORPAY_KEY_SECRET ||
    !env.RAZORPAY_WEBHOOK_SECRET
  ) {
    throw new AppError('PAYMENT_METHOD_UNAVAILABLE', 'Online payments are not available', {
      status: 422,
    })
  }
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  }
}

function hmacHex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex')
}

/** Constant-time comparison of a hex signature with the expected one. */
function sameSignature(expectedHex: string, given: string | null | undefined): boolean {
  if (!given || !/^[0-9a-f]{64}$/i.test(given)) return false
  return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(given.toLowerCase(), 'hex'))
}

/** Checkout success handler: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function verifyCheckoutSignature(
  input: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  return sameSignature(hmacHex(keySecret, `${input.orderId}|${input.paymentId}`), input.signature)
}

/** Webhooks: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): boolean {
  return sameSignature(hmacHex(webhookSecret, rawBody), signature)
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { keyId, keySecret } = razorpayConfig()
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    logger.warn({ err: error, path }, 'razorpay request failed')
    throw new AppError(
      'PAYMENT_PROVIDER_ERROR',
      'The payment service did not respond. Please try again.',
      {
        status: 502,
      },
    )
  }
  const data = (await response.json().catch(() => null)) as
    (T & { error?: { code?: string; description?: string } }) | null
  if (!response.ok || !data) {
    logger.warn({ status: response.status, error: data?.error, path }, 'razorpay request rejected')
    throw new AppError(
      'PAYMENT_PROVIDER_ERROR',
      'The payment service could not process this. Please try again.',
      { status: 502, details: { providerCode: data?.error?.code ?? null } },
    )
  }
  return data
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string }

/** An order for the checkout; `receipt` is our payment id (Razorpay allows 40 characters). */
export function createOrder(input: {
  amountPaise: number
  receipt: string
  notes: Record<string, string>
}): Promise<RazorpayOrder> {
  return call<RazorpayOrder>('/orders', {
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  })
}

export type RazorpayRefund = { id: string; amount: number; status: string }

/** Refund part or all of a captured Razorpay payment. */
export function createRefund(input: {
  providerPaymentId: string
  amountPaise: number
  notes: Record<string, string>
}): Promise<RazorpayRefund> {
  return call<RazorpayRefund>(`/payments/${encodeURIComponent(input.providerPaymentId)}/refund`, {
    amount: input.amountPaise,
    speed: 'normal',
    notes: input.notes,
  })
}
