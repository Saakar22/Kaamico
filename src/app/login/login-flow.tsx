'use client'

import { ArrowLeft, BriefcaseBusiness, House } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { ApiError, apiFetch } from '@/lib/api-client'

type Step = 'phone' | 'code' | 'details'

type OtpRequest = { maskedPhone: string; expiresInSeconds: number; simulatedCode?: string }
type VerifyResult = { redirectTo: string; user: { needsOnboarding: boolean } }

const RESEND_SECONDS = 30

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'OTP_INVALID' && typeof error.details?.remainingAttempts === 'number') {
      const left = error.details.remainingAttempts
      return left > 0
        ? `That code is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.`
        : 'Too many wrong attempts. Request a new code.'
    }
    return error.message
  }
  return 'Something went wrong. Please try again.'
}

export function LoginFlow({ initialStep, next }: { initialStep: Step; next?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(initialStep)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState<OtpRequest | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'CUSTOMER' | 'WORKER'>('CUSTOMER')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  // One key per onboarding attempt, so a double-tap or retry cannot apply it twice.
  const [onboardingKey] = useState(() => crypto.randomUUID())

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function run(action: () => Promise<void>) {
    setPending(true)
    setError(undefined)
    try {
      await action()
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setPending(false)
    }
  }

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault()
    return run(async () => {
      const result = await apiFetch<OtpRequest>('/api/v1/auth/otp/request', { body: { phone } })
      setOtp(result)
      setCode('')
      setStep('code')
      setResendIn(RESEND_SECONDS)
    })
  }

  const verify = (event: FormEvent) => {
    event.preventDefault()
    return run(async () => {
      const result = await apiFetch<VerifyResult>('/api/v1/auth/otp/verify', {
        body: { phone, code, next },
      })
      if (result.user.needsOnboarding) {
        setStep('details')
        return
      }
      router.replace(result.redirectTo)
      router.refresh()
    })
  }

  const finish = (event: FormEvent) => {
    event.preventDefault()
    return run(async () => {
      const result = await apiFetch<{ redirectTo: string }>('/api/v1/me/onboarding', {
        body: { name, role },
        idempotencyKey: onboardingKey,
      })
      router.replace(result.redirectTo)
      router.refresh()
    })
  }

  if (step === 'phone') {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Sign in or create an account</h1>
          <p className="text-ink-600">We&apos;ll send a 6-digit code to your mobile number.</p>
        </div>
        <FormField label="Mobile number" error={error} hint="Indian mobile numbers only">
          {(control) => (
            <div className="flex">
              <span className="flex h-11 items-center rounded-l-md border border-r-0 border-border bg-surface-muted px-3 text-ink-600">
                +91
              </span>
              <Input
                {...control}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={14}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-l-none"
                autoFocus
              />
            </div>
          )}
        </FormField>
        <Button type="submit" size="lg" block loading={pending} loadingText="Sending code…">
          Send code
        </Button>
      </form>
    )
  }

  if (step === 'code') {
    return (
      <form onSubmit={verify} className="flex flex-col gap-5" noValidate>
        <button
          type="button"
          onClick={() => {
            setStep('phone')
            setError(undefined)
          }}
          className="-ml-1 inline-flex h-11 w-fit items-center gap-1 rounded-md px-1 text-sm font-medium text-brand-700"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Change number
        </button>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Enter the code</h1>
          <p className="text-ink-600">Sent to {otp?.maskedPhone}. It expires in 5 minutes.</p>
        </div>
        {otp?.simulatedCode && (
          <div
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-3"
            role="status"
          >
            <SimulationBadge label="Simulated SMS" />
            <p className="text-sm">
              No SMS is sent in this demo. Your code is{' '}
              <strong className="font-mono text-base tracking-widest" data-testid="simulated-otp">
                {otp.simulatedCode}
              </strong>
            </p>
          </div>
        )}
        <FormField label="6-digit code" error={error}>
          {(control) => (
            <Input
              {...control}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="font-mono text-lg tracking-[0.4em]"
              autoFocus
            />
          )}
        </FormField>
        <Button
          type="submit"
          size="lg"
          block
          loading={pending}
          loadingText="Checking…"
          disabled={code.length !== 6}
        >
          Verify and continue
        </Button>
        <Button
          type="button"
          variant="tertiary"
          disabled={resendIn > 0 || pending}
          onClick={() => sendCode()}
        >
          {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={finish} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold">Welcome to Kaamico</h1>
        <p className="text-ink-600">Tell us your name and how you&apos;ll use Kaamico.</p>
      </div>
      <FormField label="Your name" required error={error}>
        {(control) => (
          <Input
            {...control}
            autoComplete="name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        )}
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">I want to</legend>
        <RadioGroup
          value={role}
          onValueChange={(v) => setRole(v as 'CUSTOMER' | 'WORKER')}
          aria-label="I want to"
        >
          <RadioOption
            value="CUSTOMER"
            label={
              <span className="inline-flex items-center gap-2">
                <House aria-hidden="true" className="size-4" /> Book services for my home
              </span>
            }
            description="Find nearby professionals and agree a fair price."
          />
          <RadioOption
            value="WORKER"
            label={
              <span className="inline-flex items-center gap-2">
                <BriefcaseBusiness aria-hidden="true" className="size-4" /> Offer my services
              </span>
            }
            description="Set your own prices and get jobs near you. ID verification required."
          />
        </RadioGroup>
      </fieldset>
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        loadingText="Saving…"
        disabled={name.trim().length < 2}
      >
        Continue
      </Button>
    </form>
  )
}
