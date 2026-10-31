import { CircleAlert, Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type StateProps = {
  title: ReactNode
  description?: ReactNode
  /** One primary action (and optionally a secondary one). */
  action?: ReactNode
  icon?: LucideIcon
  className?: string
}

function StateLayout({
  title,
  description,
  action,
  icon: Icon,
  className,
  iconClassName,
}: StateProps & { iconClassName: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      {Icon && (
        <span className={cn('flex size-12 items-center justify-center rounded-md', iconClassName)}>
          <Icon aria-hidden="true" className="size-6" strokeWidth={1.75} />
        </span>
      )}
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {description && <p className="max-w-sm text-ink-600">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

/** Nothing to show yet: one sentence and one way forward. */
export function EmptyState({ icon = Inbox, ...props }: StateProps) {
  return <StateLayout icon={icon} iconClassName="bg-brand-50 text-brand-700" {...props} />
}

/**
 * Something failed. Pass `reference` (request id / error digest) so users can quote
 * it to support.
 */
export function ErrorState({
  icon = CircleAlert,
  reference,
  description,
  ...props
}: StateProps & { reference?: string }) {
  return (
    <div role="alert">
      <StateLayout
        icon={icon}
        iconClassName="bg-danger-700/10 text-danger-700"
        description={
          <>
            {description}
            {reference && (
              <span className="mt-2 block text-xs text-ink-600">
                Reference: <code className="font-mono">{reference}</code>
              </span>
            )}
          </>
        }
        {...props}
      />
    </div>
  )
}
