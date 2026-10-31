'use client'

import { BadgeCheck, Clock, FlaskConical, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/i18n/client'
import { formatINR, type Paise } from '@/lib/money'
import { cn } from '@/lib/cn'

/**
 * Shown on a professional only after an admin has approved their ID.
 * Never imply background checks that were not done.
 */
export function VerificationBadge({
  status,
  className,
}: {
  status: 'VERIFIED' | 'PENDING'
  className?: string
}) {
  const t = useT()
  if (status === 'VERIFIED') {
    return (
      <Badge tone="success" className={className}>
        <BadgeCheck aria-hidden="true" />
        {t('badges.idVerified')}
      </Badge>
    )
  }
  return (
    <Badge tone="warning" className={className}>
      <Clock aria-hidden="true" />
      {t('badges.verificationPending')}
    </Badge>
  )
}

/** Mandatory wherever behaviour is simulated (OTP, payments, payouts). */
export function SimulationBadge({
  label = 'Simulated',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <Badge
      tone="neutral"
      className={cn(
        'bg-[repeating-linear-gradient(135deg,var(--color-surface-muted)_0_6px,var(--color-border)_6px_12px)] text-ink-900',
        className,
      )}
    >
      <FlaskConical aria-hidden="true" />
      {label}
    </Badge>
  )
}

/** Confirms the agreed price can no longer change without the customer's approval. */
export function PriceLockedBadge({ paise, className }: { paise: Paise; className?: string }) {
  return (
    <Badge tone="accent" className={className}>
      <Lock aria-hidden="true" />
      Price locked at <span className="tabular-nums">{formatINR(paise)}</span>
    </Badge>
  )
}
