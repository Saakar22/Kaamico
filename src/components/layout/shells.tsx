import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@/components/brand/logo'
import { cn } from '@/lib/cn'
import { AdminMobileMenu } from './admin-mobile-menu'
import { BottomTabBar, SidebarNav, TopNavLinks } from './nav'

const MAIN_ID = 'main-content'

function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only z-50 rounded-md bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Skip to content
    </a>
  )
}

function HomeLink({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex h-11 items-center rounded-md">
      <Logo />
    </Link>
  )
}

/** Customer and public pages: top bar on desktop, bottom tabs on phones. */
export function CustomerShell({
  children,
  headerSlot,
}: {
  children: ReactNode
  /** Extra header content, e.g. the location chip (Phase 5). */
  headerSlot?: ReactNode
}) {
  return (
    <>
      <SkipLink />
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-3 px-4 sm:px-6">
          <HomeLink />
          {headerSlot && <div className="min-w-0 flex-1">{headerSlot}</div>}
          <div className={cn(!headerSlot && 'ml-auto')}>
            <TopNavLinks nav="customer" label="Main" />
          </div>
        </div>
      </header>
      <main
        id={MAIN_ID}
        className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-10"
      >
        {children}
      </main>
      <BottomTabBar nav="customer" label="Main" />
    </>
  )
}

function ConsoleSidebar({
  homeHref,
  roleLabel,
  nav,
}: {
  homeHref: string
  roleLabel: string
  nav: ReactNode
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 md:flex">
      <div className="flex flex-col gap-1">
        <HomeLink href={homeHref} />
        <span className="text-xs font-medium tracking-wide text-ink-600 uppercase">
          {roleLabel}
        </span>
      </div>
      {nav}
    </aside>
  )
}

/** Worker console: sidebar on desktop, bottom tabs on phones (workers are mostly on phones). */
export function WorkerShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1">
      <SkipLink />
      <ConsoleSidebar
        homeHref="/worker/dashboard"
        roleLabel="For professionals"
        nav={<SidebarNav nav="worker" label="Professional" />}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-surface px-4 md:hidden">
          <HomeLink href="/worker/dashboard" />
        </header>
        <main
          id={MAIN_ID}
          className="w-full max-w-[1000px] flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-10"
        >
          {children}
        </main>
      </div>
      <BottomTabBar nav="worker" label="Professional" />
    </div>
  )
}

/** Admin console: desktop-first sidebar; a menu sheet on small screens. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 bg-surface-muted">
      <SkipLink />
      <ConsoleSidebar
        homeHref="/admin"
        roleLabel="Admin"
        nav={<SidebarNav nav="admin" label="Admin" />}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
          <HomeLink href="/admin" />
          <AdminMobileMenu />
        </header>
        <main id={MAIN_ID} className="w-full flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  )
}
