import { brand } from '@/config/brand'
import { cn } from '@/lib/cn'

/**
 * Logo mark: a map pin whose negative space forms a "k" with a tick in its leg
 * (local + verified). Concept artwork; to be refined by a designer.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <path
        d="M16 2C9.4 2 4 7.2 4 13.6 4 22.2 16 30 16 30s12-7.8 12-16.4C28 7.2 22.6 2 16 2Z"
        className="fill-brand-600"
      />
      <path
        d="M12 7.5v13M12 14.6 18.4 8.4M12.6 14 15.6 17.8 21 11.6"
        fill="none"
        className="stroke-surface"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Mark + wordmark lockup. The accessible name is the brand name. */
export function Logo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      aria-label={brand.name}
      role="img"
    >
      <LogoMark />
      {!markOnly && (
        <span
          aria-hidden="true"
          className="font-display text-2xl leading-none font-bold text-brand-600"
        >
          {brand.wordmark}
        </span>
      )}
    </span>
  )
}
