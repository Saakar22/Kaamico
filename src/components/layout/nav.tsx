'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isNavItemActive, navigations, type NavKey } from '@/config/navigation'
import { cn } from '@/lib/cn'

/** Fixed bottom tab bar for phones (hidden from `md` up). */
export function BottomTabBar({ nav, label }: { nav: NavKey; label: string }) {
  const pathname = usePathname()
  const items = navigations[nav]
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isNavItemActive(item, pathname)
          const Icon = item.icon
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                  active ? 'text-brand-700' : 'text-ink-600',
                )}
              >
                <Icon aria-hidden="true" className="size-6" strokeWidth={active ? 2.25 : 1.75} />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Horizontal links for the customer top bar (desktop). */
export function TopNavLinks({ nav, label }: { nav: NavKey; label: string }) {
  const pathname = usePathname()
  const items = navigations[nav]
  return (
    <nav aria-label={label} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isNavItemActive(item, pathname)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-surface-muted',
                  active ? 'text-brand-700' : 'text-ink-600 hover:text-ink-900',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Vertical sidebar for worker and admin consoles (from `md` up). */
export function SidebarNav({ nav, label }: { nav: NavKey; label: string }) {
  const pathname = usePathname()
  const items = navigations[nav]
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isNavItemActive(item, pathname)
          const Icon = item.icon
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium',
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-600 hover:bg-surface-muted hover:text-ink-900',
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
