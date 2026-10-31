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
import { useLocale, useT } from '@/i18n/client'
import { htmlLang } from '@/i18n/config'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatIstTime } from '@/lib/time'
import type { AddressSnapshot } from '@/db/schema'
import type { MessageView, NegotiationState, OfferView } from '@/modules/bookings/views'
import { OfferCard } from './offer-card'
import { formatINR } from '@/lib/money'

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
  const t = useT()
  const lang = htmlLang[useLocale()]
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
      { success: t('thread.confirmed'), refresh: false },
    )
  const reject = (offer: OfferView) =>
    run(() => apiFetch(`/api/v1/offers/${offer.id}/reject`, { body: {} }), {
      success: t('thread.declined'),
    })
  const withdraw = (offer: OfferView) =>
    run(() => apiFetch(`/api/v1/offers/${offer.id}/withdraw`, { body: {} }), {
      success: t('thread.withdrawn'),
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
      { success: t('thread.sent') },
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
        ? t('thread.tooLow')
        : n.maxPaise !== null && amount > n.maxPaise
          ? viewer === 'customer'
            ? t('thread.moreThanListed')
            : t('thread.notMoreThanBefore')
          : null

  return (
    <div className="flex flex-col gap-5">
      {data.status === 'CONFIRMED' && data.agreedPaise !== null && (
        <div
          className="flex flex-col gap-3 rounded-md border border-success-700/30 bg-success-700/10 p-4"
          role="status"
        >
          <p className="flex items-center gap-2 text-lg font-semibold">
            <Lock aria-hidden="true" className="size-5 text-success-800" />
            {t('thread.priceLocked')} <Money paise={data.agreedPaise} />
          </p>
          {viewer === 'customer' && data.startCode && (
            <div className="flex flex-col gap-1">
              <span className="text-sm">{t('thread.shareCode', { name: counterpartName })}</span>
              <span
                className="font-mono text-3xl font-bold tracking-[0.4em]"
                aria-label={t('thread.startCodeLabel', {
                  digits: data.startCode.split('').join(' '),
                })}
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
          <p className="text-sm text-ink-600">{t('thread.extraNeedsOk')}</p>
        </div>
      )}

      <ol
        className="flex flex-col gap-3"
        aria-label={t('thread.offersAndMessages')}
        aria-live="polite"
      >
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
                <span className="sr-only">
                  {item.message.fromMe ? t('thread.you') : counterpartName}:{' '}
                </span>
                {item.message.body}
                <span
                  className={cn(
                    'ml-2 text-xs',
                    item.message.fromMe ? 'text-on-fill/80' : 'text-ink-600',
                  )}
                >
                  {formatIstTime(new Date(item.message.createdAt), lang)}
                </span>
              </p>
            </li>
          ),
        )}
      </ol>

      {open && n.pendingFromThem && (
        <section
          aria-labelledby="respond-title"
          className="flex flex-col gap-3 rounded-md border border-border p-4"
        >
          <h2 id="respond-title" className="font-semibold">
            {t('thread.theyOffered', {
              name: counterpartName,
              amount: formatINR(n.pendingFromThem.amountPaise),
            })}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => accept(n.pendingFromThem!)}
              loading={pending}
              loadingText={t('thread.confirming')}
            >
              <Check aria-hidden="true" />
              {t('thread.accept')} <Money paise={n.pendingFromThem.amountPaise} />
            </Button>
            <Button
              variant="destructive"
              onClick={() => reject(n.pendingFromThem!)}
              disabled={pending}
            >
              <X aria-hidden="true" />
              {t('thread.decline')}
            </Button>
          </div>
        </section>
      )}

      {open && n.pendingFromMe && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-3 py-2">
          <span>{t('thread.waiting', { name: counterpartName })}</span>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => withdraw(n.pendingFromMe!)}
            disabled={pending}
          >
            <Undo2 aria-hidden="true" />
            {t('thread.withdraw')}
          </Button>
        </div>
      )}

      {open && n.canOffer && (viewer === 'worker' || n.negotiable) && (
        <form
          onSubmit={sendOffer}
          className="flex flex-col gap-3 rounded-md border border-border p-4"
        >
          <h2 className="font-semibold">
            {n.pendingFromThem ? t('thread.counter') : t('thread.makeOffer')}
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField
              label={t('thread.yourPrice')}
              className="sm:w-48"
              hint={
                viewer === 'customer' && n.minPaise !== null && n.maxPaise !== null
                  ? t('thread.between', {
                      min: formatINR(n.minPaise),
                      max: formatINR(n.maxPaise),
                    })
                  : n.offersLeft === 1
                    ? t('thread.finalOffer')
                    : undefined
              }
              error={amountProblem}
            >
              {(field) => <MoneyInput {...field} value={amount} onValueChange={setAmount} />}
            </FormField>
            <FormField label={t('thread.note')} className="flex-1">
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
            {t('thread.sendOffer')}
          </Button>
          <p className="text-sm text-ink-600">
            {t(n.offersLeft === 1 ? 'thread.offersLeftOne' : 'thread.offersLeftOther', {
              count: n.offersLeft,
            })}
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
            {t('thread.messageTo', { name: counterpartName })}
          </label>
          <Input
            id="thread-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder={t('thread.messageTo', { name: counterpartName })}
            autoComplete="off"
          />
          <Button
            type="submit"
            variant="secondary"
            size="icon"
            aria-label={t('thread.sendMessage')}
            disabled={!message.trim() || pending}
          >
            <Send aria-hidden="true" />
          </Button>
        </form>
      )}
      <p className="text-xs text-ink-600">{t('thread.privacy')}</p>
    </div>
  )
}
