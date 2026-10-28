'use client'

import { Check, Lock, MapPin, Send, Undo2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { useAutoRefresh } from '@/components/domain/booking/auto-refresh'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Money } from '@/components/ui/money'
import { MoneyInput } from '@/components/ui/money-input'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatIstTime } from '@/lib/time'
import type { AddressSnapshot } from '@/db/schema'
import type { MessageView, NegotiationState, OfferView } from '@/modules/bookings/views'
import { OfferCard } from './offer-card'

export type ThreadData = {
  bookingId: string
  status: string
  version: number
  listedPaise: number | null
  agreedPaise: number | null
  offers: OfferView[]
  messages: MessageView[]
  negotiation: NegotiationState
  /** Customer only, once confirmed. */
  startCode?: string | null
  /** Worker only, once confirmed. */
  address?: AddressSnapshot | null
  /** For the worker: which invited professional the thread is with (always theirs). */
  workerId?: string
}

const OPEN = ['REQUESTED', 'NEGOTIATING']
const POLL_MS = 5000

/**
 * The offer thread shared by customer and professional. `viewer` decides the labels;
 * what each side may do comes from the server (`negotiation`), never from the UI.
 */
export function NegotiationThread({
  data,
  viewer,
  counterpartName,
}: {
  data: ThreadData
  viewer: 'customer' | 'worker'
  counterpartName: string
}) {
  const router = useRouter()
  const { pending, error, run } = useApiAction()
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  // One key per attempt, so double taps cannot accept or offer twice.
  const [acceptKey, setAcceptKey] = useState(() => crypto.randomUUID())
  const [offerKey, setOfferKey] = useState(() => crypto.randomUUID())
  const open = OPEN.includes(data.status)
  const n = data.negotiation
  const myParty = viewer === 'customer' ? 'CUSTOMER' : 'WORKER'

  useAutoRefresh(POLL_MS, open)

  const accept = (offer: OfferView) =>
    run(
      async () => {
        await apiFetch(`/api/v1/offers/${offer.id}/accept`, {
          body: { expectedBookingVersion: data.version },
          idempotencyKey: acceptKey,
        })
        setAcceptKey(crypto.randomUUID())
        // Confirmed: the booking page takes over from the thread.
        router.push(
          viewer === 'customer'
            ? `/bookings/${data.bookingId}?confirmed=1`
            : `/worker/bookings/${data.bookingId}`,
        )
      },
      { success: 'Booking confirmed', refresh: false },
    )
  const reject = (offer: OfferView) =>
    run(() => apiFetch(`/api/v1/offers/${offer.id}/reject`, { body: {} }), {
      success: 'Offer declined',
    })
  const withdraw = (offer: OfferView) =>
    run(() => apiFetch(`/api/v1/offers/${offer.id}/withdraw`, { body: {} }), {
      success: 'Offer withdrawn',
    })

  const sendOffer = (event: FormEvent) => {
    event.preventDefault()
    if (amount === null) return
    return run(
      async () => {
        await apiFetch(`/api/v1/bookings/${data.bookingId}/offers`, {
          body: { amountPaise: amount, note: note || undefined },
          idempotencyKey: offerKey,
        })
        setOfferKey(crypto.randomUUID())
        setAmount(null)
        setNote('')
      },
      { success: 'Offer sent' },
    )
  }

  const sendMessage = (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim()) return
    return run(async () => {
      await apiFetch(`/api/v1/bookings/${data.bookingId}/messages`, { body: { body: message } })
      setMessage('')
    })
  }

  // Offers and messages in one timeline.
  const timeline = [
    ...data.offers.map((o) => ({ kind: 'offer' as const, at: o.createdAt, offer: o })),
    ...data.messages.map((m) => ({ kind: 'message' as const, at: m.createdAt, message: m })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  const amountProblem =
    amount === null
      ? null
      : n.minPaise !== null && amount < n.minPaise
        ? 'Too low for this service'
        : n.maxPaise !== null && amount > n.maxPaise
          ? viewer === 'customer'
            ? 'More than the listed price: accept it instead'
            : 'You cannot ask for more than before'
          : null

  return (
    <div className="flex flex-col gap-5">
      {data.status === 'CONFIRMED' && data.agreedPaise !== null && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-success-700/30 bg-success-700/10 p-4"
          role="status"
        >
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Lock aria-hidden="true" className="size-5 text-success-800" />
            Confirmed · Price locked at <Money paise={data.agreedPaise} />
          </p>
          {viewer === 'customer' && data.startCode && (
            <div className="flex flex-col gap-1">
              <span className="text-sm">
                Share this start code with {counterpartName} when they arrive. The job only starts
                with it.
              </span>
              <span
                className="font-mono text-3xl font-bold tracking-[0.4em]"
                aria-label={`Start code ${data.startCode.split('').join(' ')}`}
              >
                {data.startCode}
              </span>
            </div>
          )}
          {viewer === 'worker' && data.address && (
            <p className="flex items-start gap-2">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                {[
                  data.address.line1,
                  data.address.line2,
                  data.address.landmark,
                  data.address.locality,
                  data.address.city,
                  data.address.pincode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </p>
          )}
          <p className="text-sm text-ink-600">
            Any extra charge needs the customer&apos;s OK in the app.
          </p>
        </div>
      )}

      <ol className="flex flex-col gap-3" aria-label="Offers and messages" aria-live="polite">
        {timeline.map((item) =>
          item.kind === 'offer' ? (
            <li key={item.offer.id}>
              <OfferCard
                offer={item.offer}
                mine={item.offer.offeredBy === myParty}
                authorName={counterpartName}
                listedPaise={data.listedPaise}
              />
            </li>
          ) : (
            <li
              key={item.message.id}
              className={cn('flex', item.message.fromMe ? 'justify-end' : 'justify-start')}
            >
              <p
                className={cn(
                  'max-w-sm rounded-lg px-3 py-2 text-sm',
                  item.message.fromMe
                    ? 'bg-fill-brand text-on-fill'
                    : 'bg-surface-muted text-ink-900',
                )}
              >
                <span className="sr-only">{item.message.fromMe ? 'You' : counterpartName}: </span>
                {item.message.body}
                <span
                  className={cn(
                    'ml-2 text-xs',
                    item.message.fromMe ? 'text-on-fill/80' : 'text-ink-600',
                  )}
                >
                  {formatIstTime(new Date(item.message.createdAt))}
                </span>
              </p>
            </li>
          ),
        )}
      </ol>

      {open && n.pendingFromThem && (
        <section
          aria-labelledby="respond-title"
          className="flex flex-col gap-3 rounded-lg border border-border p-4"
        >
          <h2 id="respond-title" className="font-semibold">
            {counterpartName} offered <Money paise={n.pendingFromThem.amountPaise} />. Accept, or
            suggest your price.
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => accept(n.pendingFromThem!)}
              loading={pending}
              loadingText="Confirming…"
            >
              <Check aria-hidden="true" />
              Accept <Money paise={n.pendingFromThem.amountPaise} />
            </Button>
            <Button
              variant="destructive"
              onClick={() => reject(n.pendingFromThem!)}
              disabled={pending}
            >
              <X aria-hidden="true" />
              Decline
            </Button>
          </div>
        </section>
      )}

      {open && n.pendingFromMe && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2">
          <span>Waiting for {counterpartName} to respond.</span>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => withdraw(n.pendingFromMe!)}
            disabled={pending}
          >
            <Undo2 aria-hidden="true" />
            Withdraw my offer
          </Button>
        </div>
      )}

      {open && n.canOffer && (viewer === 'worker' || n.negotiable) && (
        <form
          onSubmit={sendOffer}
          className="flex flex-col gap-3 rounded-lg border border-border p-4"
        >
          <h2 className="font-semibold">
            {n.pendingFromThem ? 'Or make a counter-offer' : 'Make an offer'}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField
              label="Your price"
              className="sm:w-48"
              hint={
                viewer === 'customer' && n.minPaise !== null && n.maxPaise !== null ? (
                  <>
                    Between <Money paise={n.minPaise} /> and <Money paise={n.maxPaise} />
                  </>
                ) : n.offersLeft === 1 ? (
                  'This will be your final offer'
                ) : undefined
              }
              error={amountProblem}
            >
              {(field) => <MoneyInput {...field} value={amount} onValueChange={setAmount} />}
            </FormField>
            <FormField label="Note (optional)" className="flex-1">
              {(field) => (
                <Input
                  {...field}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                />
              )}
            </FormField>
          </div>
          <Button
            type="submit"
            variant="secondary"
            className="self-start"
            disabled={amount === null || !!amountProblem || pending}
          >
            Send offer
          </Button>
          <p className="text-sm text-ink-600">
            {n.offersLeft} {n.offersLeft === 1 ? 'offer' : 'offers'} left on your side.
          </p>
        </form>
      )}

      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}

      {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(data.status) && (
        <form onSubmit={sendMessage} className="flex gap-2">
          <label htmlFor="thread-message" className="sr-only">
            Message {counterpartName}
          </label>
          <Input
            id="thread-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder={`Message ${counterpartName}`}
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="secondary"
            size="icon"
            aria-label="Send message"
            disabled={!message.trim() || pending}
          >
            <Send aria-hidden="true" />
          </Button>
        </form>
      )}
      <p className="text-xs text-ink-600">
        Phone numbers and payment IDs are hidden in messages. Keep everything on Kaamico until the
        booking is confirmed.
      </p>
    </div>
  )
}
