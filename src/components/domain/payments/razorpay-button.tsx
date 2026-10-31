'use client'

import { CreditCard } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import type { PaymentView, RazorpayCheckout } from '@/modules/payments/payments'

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

type RazorpayResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}
type RazorpayInstance = { open: () => void; on: (event: string, cb: () => void) => void }
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

let loading: Promise<RazorpayConstructor> | null = null

/** Loads Razorpay Checkout once, on first use (not on every page view). */
function loadCheckout(): Promise<RazorpayConstructor> {
  const ready = () => (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay
  if (ready()) return Promise.resolve(ready()!)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_SRC
    script.async = true
    script.onload = () => (ready() ? resolve(ready()!) : reject(new Error('Checkout missing')))
    script.onerror = () => {
      loading = null
      reject(new Error('Could not load the payment window'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * Starts (or resumes) a Razorpay payment for a completed booking: the server creates the
 * order for the booking's amount, Checkout collects the payment, and the server verifies
 * Checkout's signature before the booking counts as paid.
 */
export function RazorpayButton({
  bookingId,
  children,
  ...props
}: { bookingId: string; children: ReactNode } & Omit<ButtonProps, 'onClick' | 'loading'>) {
  const router = useRouter()
  const t = useT()
  const { pending, error, run } = useApiAction()
  const [key, setKey] = useState(() => crypto.randomUUID())

  const pay = () =>
    run(
      async () => {
        const { payment, checkout } = await apiFetch<{
          payment: PaymentView
          checkout: RazorpayCheckout
        }>(`/api/v1/bookings/${bookingId}/payments`, {
          body: { method: 'RAZORPAY' },
          idempotencyKey: key,
        })
        setKey(crypto.randomUUID())
        const Razorpay = await loadCheckout()
        const brand = getComputedStyle(document.documentElement)
          .getPropertyValue('--color-brand-600')
          .trim()
        const checkoutWindow = new Razorpay({
          key: checkout.keyId,
          order_id: checkout.orderId,
          amount: checkout.amountPaise,
          currency: checkout.currency,
          name: 'Kaamico',
          description: checkout.description,
          theme: brand ? { color: brand } : undefined,
          handler: async (response: RazorpayResponse) => {
            try {
              await apiFetch(`/api/v1/payments/${payment.id}/razorpay`, { body: response })
              toast.success(t('pay.success'))
            } catch {
              toast.error(t('pay.confirmLater'))
            }
            router.refresh()
          },
          modal: { ondismiss: () => router.refresh() },
        })
        checkoutWindow.on('payment.failed', () => router.refresh())
        checkoutWindow.open()
      },
      { refresh: false },
    )

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={pay} loading={pending} loadingText={t('pay.opening')} {...props}>
        <CreditCard aria-hidden="true" />
        {children}
      </Button>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
