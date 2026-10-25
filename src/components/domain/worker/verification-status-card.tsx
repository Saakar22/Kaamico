import { BadgeCheck, CircleAlert, Clock, FileUp, ShieldX, type LucideIcon } from 'lucide-react'
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

function describe(state: VerificationState): {
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
      title: 'Account suspended',
      body: 'Contact Kaamico support to find out more.',
    }
  }
  if (state.workerStatus === 'VERIFIED') {
    return {
      tone: 'success',
      icon: BadgeCheck,
      title: 'ID verified',
      body: 'Customers see a verified badge on your profile.',
    }
  }
  switch (app?.status) {
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return {
        tone: 'warning',
        icon: Clock,
        title: 'Under review',
        body: `Submitted ${formatIstDateTime(new Date(app.submittedAt!))}. We usually review within 2 working days.`,
      }
    case 'RESUBMISSION_REQUESTED':
      return {
        tone: 'warning',
        icon: FileUp,
        title: 'Please upload again',
        body: app.decisionReason ?? 'Some documents need to be uploaded again.',
      }
    case 'REJECTED':
      return {
        tone: 'danger',
        icon: CircleAlert,
        title: 'Not approved',
        body: `${app.decisionReason ?? ''}${
          state.canReapplyAt
            ? ` You can apply again from ${formatIstDateTime(new Date(state.canReapplyAt))}.`
            : ' You can apply again now.'
        }`.trim(),
      }
    default:
      return {
        tone: 'neutral',
        icon: FileUp,
        title: 'Not verified yet',
        body: 'Upload your ID and a selfie. Customers only see you once an admin has checked them.',
      }
  }
}

/** Where the professional stands with ID verification, including any reason given by the admin. */
export function VerificationStatusCard({
  state,
  className,
}: {
  state: VerificationState
  className?: string
}) {
  const { tone, icon: Icon, title, body } = describe(state)
  return (
    <div
      className={cn('flex items-start gap-3 rounded-lg border p-4', TONES[tone], className)}
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
