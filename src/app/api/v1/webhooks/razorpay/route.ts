import { route } from '@/lib/http'
import { handleRazorpayWebhook } from '@/modules/payments/webhooks'

/**
 * Razorpay events (payment.captured, payment.failed, refund.processed, refund.failed).
 * Authenticated by the HMAC signature, not a session, so there is no Origin check.
 */
export const POST = route(
  async (request) => {
    const result = await handleRazorpayWebhook(
      await request.text(),
      request.headers.get('x-razorpay-signature'),
      request.headers.get('x-razorpay-event-id'),
    )
    return Response.json(result)
  },
  { csrf: false },
)
