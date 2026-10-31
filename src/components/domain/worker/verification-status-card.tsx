import { BadgeCheck, CircleAlert, Clock, FileUp, ShieldX, type LucideIcon } from 'lucide-react'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import type { Translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { formatIstDateTime } from '@/lib/time'
import type { VerificationState } from '@/modules/verification/verification'

type Tone = 'neutral' | 'warning' | 'success' | 'danger'

const TONES: Record<Tone, string> = {
  neutral: 'border-border bg-surface',
  warning: 'border-warning-700/30 bg-warning-700/10',
  success: 'border-success-700/30 bg-success-700/10',
  danger: 'border-danger-700/30 bg-danger-700/10',
}
const ICON_TONES: Record<Tone, string> = {
  neutral: 'text-ink-600',
  warning: 'text-warning-800',
  success: 'text-success-800',
  danger: 'text-danger-700',
}

function describe(
  state: VerificationState,
  t: Translate,
  lang: string,
): {
  tone: Tone
  icon: LucideIcon
  title: string
  body: string
} {
  const app = state.application
  if (state.workerStatus === 'SUSPENDED') {
    return {
      tone: 'danger',
      icon: ShieldX,
      title: t('wverify.suspended'),
      body: t('wverify.suspendedBody'),
    }
  }
  if (state.workerStatus === 'VERIFIED') {
    return {
      tone: 'success',
      icon: BadgeCheck,
      title: t('wverify.verified'),
      body: t('wverify.verifiedBody'),
    }
  }
  switch (app?.status) {
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return {
        tone: 'warning',
        icon: Clock,
        title: t('wverify.underReview'),
        body: t('wverify.underReviewBody', {
          date: formatIstDateTime(new Date(app.submittedAt!), lang),
        }),
      }
    case 'RESUBMISSION_REQUESTED':
      return {
        tone: 'warning',
        icon: FileUp,
        title: t('wverify.uploadAgain'),
        body: app.decisionReason ?? t('wverify.uploadAgainBody'),
      }
    case 'REJECTED':
      return {
        tone: 'danger',
        icon: CircleAlert,
        title: t('wverify.notApproved'),
        body: `${app.decisionReason ?? ''} ${
          state.canReapplyAt
            ? t('wverify.reapplyFrom', {
                date: formatIstDateTime(new Date(state.canReapplyAt), lang),
              })
            : t('wverify.reapplyNow')
        }`.trim(),
      }
    default:
      return {
        tone: 'neutral',
        icon: FileUp,
        title: t('wverify.notYet'),
        body: t('wverify.notYetBody'),
      }
  }
}

/** Where the professional stands with ID verification, including any reason given by the admin. */
export async function VerificationStatusCard({
  state,
  className,
}: {
  state: VerificationState
  className?: string
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const { tone, icon: Icon, title, body } = describe(state, t, htmlLang[locale])
  return (
    <div
      className={cn('flex items-start gap-3 rounded-md border p-4', TONES[tone], className)}
      role="status"
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-6 shrink-0', ICON_TONES[tone])} />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{title}</p>
        <p className="text-ink-900">{body}</p>
      </div>
    </div>
  )
}
