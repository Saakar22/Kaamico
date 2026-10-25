import Link from 'next/link'
import { cn } from '@/lib/cn'

/** Tabs that are links (`?tab=…`), so each tab is shareable and works without JavaScript. */
export function LinkTabs({
  label,
  tabs,
  current,
}: {
  label: string
  tabs: { href: string; label: string; key: string; count?: number }[]
  current: string
}) {
  return (
    <nav aria-label={label} className="overflow-x-auto">
      <ul className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === current ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap',
                t.key === current
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-600 hover:text-ink-900',
              )}
            >
              {t.label}
              {t.count ? (
                <span className="rounded-full bg-brand-600 px-1.5 text-xs text-white">
                  {t.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
