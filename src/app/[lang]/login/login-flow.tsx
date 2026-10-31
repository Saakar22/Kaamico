'use client'

import { ArrowLeft, BriefcaseBusiness, House } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { SimulationBadge } from '@/components/domain/trust-badges'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { useErrorMessage, useT } from '@/i18n/client'
import type { Translate } from '@/i18n/translate'
import { ApiError, apiFetch } from '@/lib/api-client'

type Step = 'phone' | 'code' | 'details'

type OtpRequest = { maskedPhone: string; expiresInSeconds: number; simulatedCode?: string }
type VerifyResult = { redirectTo: string; user: { needsOnboarding: boolean } }

const RESEND_SECONDS = 30

function messageFor(error: unknown, t: Translate, fallback: (error: unknown) => string): string {
  if (error instanceof ApiError) {
    if (error.code === 'OTP_INVALID' && typeof error.details?.remainingAttempts === 'number') {
      const left = error.details.remainingAttempts
      return left > 0
        ? t(left === 1 ? 'login.wrongCodeOne' : 'login.wrongCodeOther', { count: left })
        : t('login.tooManyCodes')
    }
    const issues = (error.details?.issues as { path: string }[] | undefined) ?? []
    if (issues.some((i) => i.path === 'phone')) return t('login.invalidPhone')
  }
  return fallback(error)
}

export function LoginFlow({ initialStep, next }: { initialStep: Step; next?: string }) {
  const router = useRouter()
  const t = useT()
  const errorMessage = useErrorMessage()
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
      setError(messageFor(e, t, errorMessage))
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
          <h1 className="font-display text-2xl font-bold">{t('login.title')}</h1>
          <p className="text-ink-600">{t('login.sendIntro')}</p>
        </div>
        <FormField label={t('login.mobile')} error={error} hint={t('login.mobileHint')}>
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
        <Button
          type="submit"
          size="lg"
          block
          loading={pending}
          loadingText={t('login.sendingCode')}
        >
          {t('login.sendCode')}
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
          {t('login.changeNumber')}
        </button>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">{t('login.enterCode')}</h1>
          <p className="text-ink-600">{t('login.sentTo', { phone: otp?.maskedPhone ?? '' })}</p>
        </div>
        {otp?.simulatedCode && (
          <div
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-muted p-3"
            role="status"
          >
            <SimulationBadge label={t('login.simulatedSms')} />
            <p className="text-sm">
              {t('login.noSms')}{' '}
              <strong className="font-mono text-base tracking-widest" data-testid="simulated-otp">
                {otp.simulatedCode}
              </strong>
            </p>
          </div>
        )}
        <FormField label={t('login.code')} error={error}>
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
          loadingText={t('login.checking')}
          disabled={code.length !== 6}
        >
          {t('login.verify')}
        </Button>
        <Button
          type="button"
          variant="tertiary"
          disabled={resendIn > 0 || pending}
          onClick={() => sendCode()}
        >
          {resendIn > 0 ? t('login.resendIn', { seconds: resendIn }) : t('login.resend')}
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={finish} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold">{t('login.welcome')}</h1>
        <p className="text-ink-600">{t('login.welcomeBody')}</p>
      </div>
      <FormField label={t('login.name')} required error={error}>
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
        <legend className="mb-1.5 text-sm font-medium">{t('login.iWantTo')}</legend>
        <RadioGroup
          value={role}
          onValueChange={(v) => setRole(v as 'CUSTOMER' | 'WORKER')}
          aria-label={t('login.iWantTo')}
        >
          <RadioOption
            value="CUSTOMER"
            label={
              <span className="inline-flex items-center gap-2">
                <House aria-hidden="true" className="size-4" /> {t('login.customer')}
              </span>
            }
            description={t('login.customerHint')}
          />
          <RadioOption
            value="WORKER"
            label={
              <span className="inline-flex items-center gap-2">
                <BriefcaseBusiness aria-hidden="true" className="size-4" /> {t('login.worker')}
              </span>
            }
            description={t('login.workerHint')}
          />
        </RadioGroup>
      </fieldset>
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        loadingText={t('login.saving')}
        disabled={name.trim().length < 2}
      >
        {t('login.continue')}
      </Button>
    </form>
  )
}
