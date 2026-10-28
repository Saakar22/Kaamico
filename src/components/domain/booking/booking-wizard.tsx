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
import { apiFetch, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatIstDateTime, formatIstTime } from '@/lib/time'
import type { SavedAddress } from '@/modules/addresses/addresses'
import { formatDuration, unitSuffix, type PricingUnit } from '@/modules/catalog/units'
import { customerFloor } from '@/modules/negotiation/rules'

type Props = {
  service: { id: string; name: string; unit: PricingUnit; durationMin: number }
  worker: { id: string; name: string; photoUrl: string | null }
  price: { listedPaise: number; minChargePaise: number; negotiable: boolean }
  addresses: SavedAddress[]
  localities: { id: string; city: string; name: string; pincode: string | null }[]
  availableNow: boolean
  days: { date: string; label: string }[]
}

const STEPS = ['Address', 'When', 'Details', 'Price', 'Review']

/** The booking wizard (§4.2 step 6). The server re-checks everything on submit. */
export function BookingWizard(props: Props) {
  const router = useRouter()
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
        ? `Offers for this service start at ₹${floor / 100}`
        : offer > price.listedPaise
          ? 'That is more than the listed price: accept it instead'
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
        setError(e.message)
        if (e.code === 'SLOT_TAKEN') {
          setAlternatives((e.details?.alternatives as string[]) ?? [])
          setStep(1)
        }
      } else setError('Something went wrong. Please try again.')
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS} current={step} />
      <Card>
        <CardContent className="flex items-center gap-3">
          <Avatar name={worker.name} src={worker.photoUrl} />
          <div className="flex flex-col">
            <span className="font-semibold">{service.name}</span>
            <span className="text-sm text-ink-600">
              with {worker.name} · <Money paise={price.listedPaise} /> {unitSuffix(service.unit)} ·
              about {formatDuration(service.durationMin)}
            </span>
          </div>
        </CardContent>
      </Card>

      {step === 0 && (
        <section aria-labelledby="step-title" className="flex flex-col gap-4">
          <h2 id="step-title" className="text-xl font-semibold">
            Where is the job?
          </h2>
          {addresses.length > 0 && (
            <RadioGroup value={addressId} onValueChange={setAddressId} aria-label="Saved addresses">
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
              Add a new address
            </Button>
          )}
          <p className="text-sm text-ink-600">
            {firstName} sees only your area until the booking is confirmed.
          </p>
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="step-title" className="flex flex-col gap-4">
          <h2 id="step-title" className="text-xl font-semibold">
            When do you need {firstName}?
          </h2>
          <RadioGroup
            value={timing}
            onValueChange={(v) => setTiming(v as typeof timing)}
            aria-label="When"
          >
            <RadioOption
              value="ON_DEMAND"
              disabled={!props.availableNow}
              label={
                <span className="flex items-center gap-1.5">
                  <Zap aria-hidden="true" className="size-4" /> As soon as possible
                </span>
              }
              description={
                props.availableNow
                  ? `${firstName} is available now`
                  : `${firstName} is not available right now`
              }
            />
            <RadioOption
              value="SCHEDULED"
              label={
                <span className="flex items-center gap-1.5">
                  <CalendarClock aria-hidden="true" className="size-4" /> Choose a time
                </span>
              }
            />
          </RadioGroup>
          {timing === 'SCHEDULED' && (
            <div className="flex flex-col gap-3">
              <FormField label="Day">
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
                  Checking {firstName}&apos;s free times…
                </p>
              ) : slots.length === 0 ? (
                <p className="text-ink-600">No free times that day. Try another day.</p>
              ) : (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Start time (IST)</legend>
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
                        {formatIstTime(new Date(s.start))}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {alternatives.length > 0 && (
                <p className="text-sm" role="status">
                  Free soon: {alternatives.map((a) => formatIstDateTime(new Date(a))).join(' · ')}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="step-title" className="flex flex-col gap-4">
          <h2 id="step-title" className="text-xl font-semibold">
            Tell {firstName} about the job
          </h2>
          <FormField
            label="What needs doing? (optional)"
            hint="Up to 1000 characters. Do not include phone numbers."
          >
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
            Your price
          </h2>
          <RadioGroup
            value={decision}
            onValueChange={(v) => setDecision(v as typeof decision)}
            aria-label="Price"
          >
            <RadioOption
              value="ACCEPT_LISTED"
              label={
                <>
                  Accept <Money paise={price.listedPaise} />
                </>
              }
              description={`${firstName}'s own price. ${firstName} still confirms the job.`}
            />
            <RadioOption
              value="OFFER"
              disabled={!price.negotiable}
              label="Suggest a different price"
              description={
                price.negotiable
                  ? `${firstName} can accept, decline or counter.`
                  : `${firstName} has a fixed price for this service.`
              }
            />
          </RadioGroup>
          {decision === 'OFFER' && (
            <FormField
              label="Your offer"
              hint={
                <>
                  Between <Money paise={floor} /> and <Money paise={price.listedPaise} />
                </>
              }
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
            Check and send
          </h2>
          <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {[
              ['Service', service.name],
              ['Professional', worker.name],
              [
                'Where',
                address
                  ? `${address.line1}, ${[address.locality, address.city].filter(Boolean).join(', ')}`
                  : '',
              ],
              [
                'When',
                timing === 'ON_DEMAND' ? 'As soon as possible' : formatIstDateTime(new Date(start)),
              ],
              [
                'Your price',
                amount !== null
                  ? `₹${(amount / 100).toLocaleString('en-IN')}${decision === 'OFFER' ? ' (your offer)' : ''}`
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
            {firstName} sees your full address only after confirming. No payment is taken now.
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
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            Continue
          </Button>
        ) : (
          <Button onClick={submit} loading={pending} loadingText="Sending…">
            <Check aria-hidden="true" />
            Send request to {firstName}
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
        if (issues.length === 0) setError(e.message)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <FormField label="Flat, house and street" required error={errors.line1}>
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
      <FormField label="Landmark (optional)" error={errors.landmark}>
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
        <FormField label="Area" required error={errors.localityId}>
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
                Choose your area
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
        <FormField label="Pincode" required error={errors.pincode}>
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
          loadingText="Saving…"
          disabled={!line1 || !localityId || pincode.length !== 6}
        >
          Save address
        </Button>
        {onCancel && (
          <Button variant="tertiary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
