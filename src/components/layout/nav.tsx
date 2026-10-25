'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, type ComponentType } from 'react'
import { isNavItemActive, navigations, type NavKey } from '@/config/navigation'
import { cn } from '@/lib/cn'

type NavProps = { nav: NavKey; label: string }
type ViewProps = NavProps & { pathname: string | null }

/**
 * Reading the pathname suspends while prerendering a route whose params are only known
 * at request time (e.g. /professionals/[id]). Each nav renders without an active item as
 * the fallback, so the surrounding shell still prerenders.
 */
function withPathname(View: ComponentType<ViewProps>) {
  function Live(props: NavProps) {
    return <View {...props} pathname={usePathname()} />
  }
  return function Nav(props: NavProps) {
    return (
      <Suspense fallback={<View {...props} pathname={null} />}>
        <Live {...props} />
      </Suspense>
    )
  }
}

const active = (pathname: string | null, item: Parameters<typeof isNavItemActive>[0]) =>
  pathname !== null && isNavItemActive(item, pathname)

function BottomTabBarView({ nav, label, pathname }: ViewProps) {
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
          const isActive = active(pathname, item)
          const Icon = item.icon
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
                  isActive ? 'text-brand-700' : 'text-ink-600',
                )}
              >
                <Icon aria-hidden="true" className="size-6" strokeWidth={isActive ? 2.25 : 1.75} />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function TopNavLinksView({ nav, label, pathname }: ViewProps) {
  const items = navigations[nav]
  return (
    <nav aria-label={label} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const isActive = active(pathname, item)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-surface-muted',
                  isActive ? 'text-brand-700' : 'text-ink-600 hover:text-ink-900',
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

function SidebarNavView({ nav, label, pathname }: ViewProps) {
  const items = navigations[nav]
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = active(pathname, item)
          const Icon = item.icon
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium',
                  isActive
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

/** Fixed bottom tab bar for phones (hidden from `md` up). */
export const BottomTabBar = withPathname(BottomTabBarView)

/** Horizontal links for the customer top bar (desktop). */
export const TopNavLinks = withPathname(TopNavLinksView)

/** Vertical sidebar for worker and admin consoles (from `md` up). */
export const SidebarNav = withPathname(SidebarNavView)
