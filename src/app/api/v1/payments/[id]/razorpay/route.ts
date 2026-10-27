import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { confirmRazorpay } from '@/modules/payments/payments'

/**
 * `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` from Razorpay Checkout's
 * success handler. The signature is verified before the payment counts as paid.
 */
export const POST = route<RouteContext<'/api/v1/payments/[id]/razorpay'>>(async (request, ctx) => {
  const actor = await requireApiActor(request, { role: 'CUSTOMER' })
  return Response.json(await confirmRazorpay(actor, (await ctx.params).id, await readJson(request)))
})
