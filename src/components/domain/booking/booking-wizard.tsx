'use client'

import { ArrowLeft, CalendarClock, Check, MapPin, Plus, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Stepper } from '@/components/patterns/stepper'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Money } from '@/components/ui/money'
import { MoneyInput } from '@/components/ui/money-input'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { useErrorMessage, useLocale, useT } from '@/i18n/client'
import { htmlLang } from '@/i18n/config'
import type { MessageKey } from '@/i18n/translate'
import { apiFetch, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatIstDateTime, formatIstTime } from '@/lib/time'
import type { SavedAddress } from '@/modules/addresses/addresses'
import { formatDuration, unitSuffix, type PricingUnit } from '@/modules/catalog/units'
import { customerFloor } from '@/modules/negotiation/rules'
import { formatINR } from '@/lib/money'

type Props = {
  service: { id: string; name: string; unit: PricingUnit; durationMin: number }
  worker: { id: string; name: string; photoUrl: string | null }
  price: { listedPaise: number; minChargePaise: number; negotiable: boolean }
  addresses: SavedAddress[]
  localities: { id: string; city: string; name: string; pincode: string | null }[]
  availableNow: boolean
  days: { date: string; label: string }[]
}

const STEPS: MessageKey[] = [
  'book.stepAddress',
  'book.stepWhen',
  'book.stepDetails',
  'book.stepPrice',
  'book.stepReview',
]

/** The booking wizard (§4.2 step 6). The server re-checks everything on submit. */
export function BookingWizard(props: Props) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const lang = htmlLang[locale]
  const errorMessage = useErrorMessage()
  const { service, worker, price } = props
  const firstName = worker.name.split(' ')[0]
  const [step, setStep] = useState(0)
  const [addresses, setAddresses] = useState(props.addresses)
  const [addressId, setAddressId] = useState(props.addresses[0]?.id ?? '')
  const [adding, setAdding] = useState(props.addresses.length === 0)
  const [timing, setTiming] = useState<'ON_DEMAND' | 'SCHEDULED'>(
    props.availableNow ? 'ON_DEMAND' : 'SCHEDULED',
  )
  const [date, setDate] = useState(props.days[0]?.date ?? '')
  // Free start times per IST day, fetched once per day.
  const [slotsByDate, setSlotsByDate] = useState<Record<string, { start: string }[]>>({})
  const slots = slotsByDate[date] ?? null
  const [start, setStart] = useState('')
  const [description, setDescription] = useState('')
  const [decision, setDecision] = useState<'ACCEPT_LISTED' | 'OFFER'>('ACCEPT_LISTED')
  const [offer, setOffer] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [alternatives, setAlternatives] = useState<string[]>([])
  // Generated once per visit: a double submit or retry returns the same booking.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const floor = customerFloor({
    listedPricePaise: price.listedPaise,
    minChargePaise: price.minChargePaise,
    negotiable: price.negotiable,
  })

  useEffect(() => {
    if (timing !== 'SCHEDULED' || !date || slotsByDate[date]) return
    let cancelled = false
    apiFetch<{ slots: { start: string }[] }>(
      `/api/v1/professionals/${worker.id}/availability?serviceId=${service.id}&date=${date}`,
    )
      .then((r) => !cancelled && setSlotsByDate((m) => ({ ...m, [date]: r.slots })))
      .catch(() => !cancelled && setSlotsByDate((m) => ({ ...m, [date]: [] })))
    return () => {
      cancelled = true
    }
  }, [timing, date, worker.id, service.id, slotsByDate])

  const address = useMemo(() => addresses.find((a) => a.id === addressId), [addresses, addressId])
  const amount = decision === 'ACCEPT_LISTED' ? price.listedPaise : offer
  const offerProblem =
    decision === 'OFFER' && offer !== null
      ? offer < floor
        ? t('book.offerFrom', { amount: `₹${floor / 100}` })
        : offer > price.listedPaise
          ? t('book.offerAboveListed')
          : null
      : null

  const canContinue = [
    !!addressId && !adding,
    timing === 'ON_DEMAND' || !!start,
    true,
    amount !== null && !offerProblem,
    true,
  ][step]

  async function submit() {
    setPending(true)
    setError(undefined)
    setAlternatives([])
    try {
      const result = await apiFetch<{ bookingId: string }>('/api/v1/bookings', {
        body: {
          serviceId: service.id,
          workerId: worker.id,
          timing,
          requestedStart: timing === 'SCHEDULED' ? start : undefined,
          addressId,
          description: description || undefined,
          priceDecision:
            decision === 'OFFER'
              ? { type: 'OFFER', amountPaise: offer }
              : { type: 'ACCEPT_LISTED' },
        },
        idempotencyKey,
      })
      router.push(`/bookings/${result.bookingId}/negotiate`)
    } catch (e) {
      if (e instanceof ApiError) {
        setError(errorMessage(e))
        if (e.code === 'SLOT_TAKEN') {
          setAlternatives((e.details?.alternatives as string[]) ?? [])
          setStep(1)
        }
      } else setError(errorMessage(e))
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS.map((s) => t(s))} current={step} />
      <Card>
        <CardContent className="flex items-center gap-3">
          <Avatar name={worker.name} src={worker.photoUrl} />
          <div className="flex flex-col">
            <span className="font-semibold">{service.name}</span>
            <span className="text-sm text-ink-600">
              {t('book.withPro', { name: worker.name })} · <Money paise={price.listedPaise} />{' '}
              {unitSuffix(service.unit, locale)} ·{' '}
              {t('book.about', { duration: formatDuration(service.durationMin, locale) })}
            </span>
          </div>
        </CardContent>
      </Card>

      {step === 0 && (
        <section aria-labelledby="step-title" className="flex flex-col gap-4">
          <h2 id="step-title" className="text-xl font-semibold">
            {t('book.whereTitle')}
          </h2>
          {addresses.length > 0 && (
            <RadioGroup
              value={addressId}
              onValueChange={setAddressId}
              aria-label={t('book.savedAddresses')}
            >
              {addresses.map((a) => (
                <RadioOption
                  key={a.id}
                  value={a.id}
                  label={a.line1}
                  description={[a.landmark, a.locality, a.city, a.pincode]
                    .filter(Boolean)
                    .join(', ')}
                />
              ))}
            </RadioGroup>
          )}
          {adding ? (
            <AddressForm
              localities={props.localities}
              onSaved={(a) => {
                setAddresses((list) => [a, ...list])
                setAddressId(a.id)
                setAdding(false)
              }}
              onCancel={addresses.length > 0 ? () => setAdding(false) : undefined}
            />
          ) : (
            <Button variant="tertiary" className="self-start" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              {t('book.addAddress')}
            </Button>
          )}
          <p className="text-sm text-ink-600">{t('book.areaOnly', { name: firstName })}</p>
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="step-title" className="flex flex-col gap-4">
          <h2 id="step-title" className="text-xl font-semibold">
            {t('book.whenTitle', { name: firstName })}
          </h2>
          <RadioGroup
            value={timing}
            onValueChange={(v) => setTiming(v as typeof timing)}
            aria-label={t('book.when')}
          >
            <RadioOption
              value="ON_DEMAND"
              disabled={!props.availableNow}
              label={
                <span className="flex items-center gap-1.5">
                  <Zap aria-hidden="true" className="size-4" /> {t('book.asap')}
                </span>
              }
              description={
                props.availableNow
                  ? t('book.availableNow', { name: firstName })
                  : t('book.notAvailableNow', { name: firstName })
              }
            />
            <RadioOption
              value="SCHEDULED"
              label={
                <span className="flex items-center gap-1.5">
                  <CalendarClock aria-hidden="true" className="size-4" /> {t('book.chooseTime')}
                </span>
              }
            />
          </RadioGroup>
          {timing === 'SCHEDULED' && (
            <div className="flex flex-col gap-3">
              <FormField label={t('book.day')}>
                {(field) => (
                  <NativeSelect
                    {...field}
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value)
                      setStart('')
                    }}
                    className="sm:w-64"
                  >
                    {props.days.map((d) => (
                      <option key={d.date} value={d.date}>
                        {d.label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              {slots === null ? (
                <p className="text-ink-600" role="status">
                  {t('book.checkingTimes', { name: firstName })}
                </p>
              ) : slots.length === 0 ? (
                <p className="text-ink-600">{t('book.noTimes')}</p>
              ) : (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">{t('book.startTime')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        aria-pressed={start === s.start}
                        onClick={() => setStart(s.start)}
                        className={cn(
                          'h-11 rounded-full border px-4 text-sm tabular-nums',
                          start === s.start
                            ? 'border-fill-brand bg-fill-brand text-on-fill'
                            : 'border-border hover:border-brand-600',
                        )}
                      >
                        {formatIstTime(new Date(s.start), lang)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {alternatives.length > 0 && (
                <p className="text-sm" role="status">
                  {t('book.freeSoon', {
                    times: alternatives
                      .map((a) => formatIstDateTime(new Date(a), lang))
                      .join(' · '),
                  })}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="step-title" className="flex flex-col gap-4">
          <h2 id="step-title" className="text-xl font-semibold">
            {t('book.detailsTitle', { name: firstName })}
          </h2>
          <FormField label={t('book.whatNeedsDoing')} hint={t('book.detailsHint')}>
            {(field) => (
              <Textarea
                {...field}
                rows={4}
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </FormField>
        </section>
      )}

      {step === 3 && (
        <section aria-labelledby="step-title" className="flex flex-col gap-4">
          <h2 id="step-title" className="text-xl font-semibold">
            {t('book.priceTitle')}
          </h2>
          <RadioGroup
            value={decision}
            onValueChange={(v) => setDecision(v as typeof decision)}
            aria-label={t('book.price')}
          >
            <RadioOption
              value="ACCEPT_LISTED"
              label={
                <>
                  {t('book.accept')} <Money paise={price.listedPaise} />
                </>
              }
              description={t('book.ownPrice', { name: firstName })}
            />
            <RadioOption
              value="OFFER"
              disabled={!price.negotiable}
              label={t('book.suggest')}
              description={
                price.negotiable
                  ? t('book.canCounter', { name: firstName })
                  : t('book.fixedPrice', { name: firstName })
              }
            />
          </RadioGroup>
          {decision === 'OFFER' && (
            <FormField
              label={t('book.yourOffer')}
              hint={t('book.between', {
                min: formatINR(floor),
                max: formatINR(price.listedPaise),
              })}
              error={offerProblem}
            >
              {(field) => (
                <MoneyInput {...field} value={offer} onValueChange={setOffer} className="sm:w-48" />
              )}
            </FormField>
          )}
        </section>
      )}

      {step === 4 && (
        <section aria-labelledby="step-title" className="flex flex-col gap-4">
          <h2 id="step-title" className="text-xl font-semibold">
            {t('book.reviewTitle')}
          </h2>
          <dl className="flex flex-col divide-y divide-border rounded-md border border-border">
            {[
              [t('book.service'), service.name],
              [t('book.professional'), worker.name],
              [
                t('book.where'),
                address
                  ? `${address.line1}, ${[address.locality, address.city].filter(Boolean).join(', ')}`
                  : '',
              ],
              [
                t('book.when'),
                timing === 'ON_DEMAND' ? t('book.asap') : formatIstDateTime(new Date(start), lang),
              ],
              [
                t('book.yourPrice'),
                amount !== null
                  ? `₹${(amount / 100).toLocaleString('en-IN')}${decision === 'OFFER' ? t('book.yourOfferSuffix') : ''}`
                  : '',
              ],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-ink-600">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="flex items-start gap-2 text-sm text-ink-600">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t('book.afterConfirm', { name: firstName })}
          </p>
        </section>
      )}

      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={pending}>
            <ArrowLeft aria-hidden="true" />
            {t('book.back')}
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            {t('book.continue')}
          </Button>
        ) : (
          <Button onClick={submit} loading={pending} loadingText={t('book.sending')}>
            <Check aria-hidden="true" />
            {t('book.send', { name: firstName })}
          </Button>
        )}
      </div>
    </div>
  )
}

function AddressForm({
  localities,
  onSaved,
  onCancel,
}: {
  localities: Props['localities']
  onSaved: (a: SavedAddress) => void
  onCancel?: () => void
}) {
  const t = useT()
  const errorMessage = useErrorMessage()
  const cities = [...new Set(localities.map((l) => l.city))]
  const [line1, setLine1] = useState('')
  const [landmark, setLandmark] = useState('')
  const [localityId, setLocalityId] = useState('')
  const [pincode, setPincode] = useState('')
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string>()

  async function save(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setErrors({})
    setError(undefined)
    try {
      const { address } = await apiFetch<{ address: SavedAddress }>('/api/v1/addresses', {
        body: { line1, landmark: landmark || undefined, localityId, pincode },
      })
      onSaved(address)
    } catch (e) {
      if (e instanceof ApiError) {
        const issues = (e.details?.issues as { path: string; message: string }[]) ?? []
        setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])))
        if (issues.length === 0) setError(errorMessage(e))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <FormField label={t('book.line1')} required error={errors.line1}>
        {(field) => (
          <Input
            {...field}
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            autoComplete="address-line1"
            maxLength={120}
          />
        )}
      </FormField>
      <FormField label={t('book.landmark')} error={errors.landmark}>
        {(field) => (
          <Input
            {...field}
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
            maxLength={120}
          />
        )}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('book.area')} required error={errors.localityId}>
          {(field) => (
            <NativeSelect
              {...field}
              value={localityId}
              onChange={(e) => {
                setLocalityId(e.target.value)
                const l = localities.find((x) => x.id === e.target.value)
                if (l?.pincode && !pincode) setPincode(l.pincode)
              }}
            >
              <option value="" disabled>
                {t('book.chooseArea')}
              </option>
              {cities.map((city) => (
                <optgroup key={city} label={city}>
                  {localities
                    .filter((l) => l.city === city)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label={t('book.pincode')} required error={errors.pincode}>
          {(field) => (
            <Input
              {...field}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="postal-code"
            />
          )}
        </FormField>
      </div>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="secondary"
          loading={pending}
          loadingText={t('book.saving')}
          disabled={!line1 || !localityId || pincode.length !== 6}
        >
          {t('book.saveAddress')}
        </Button>
        {onCancel && (
          <Button variant="tertiary" onClick={onCancel}>
            {t('book.cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}
