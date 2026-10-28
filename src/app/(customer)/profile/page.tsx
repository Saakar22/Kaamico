import { CalendarCheck, ChevronRight, Heart, LifeBuoy, type LucideIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { AccountForm } from '@/components/domain/account/account-form'
import { PageHeader } from '@/components/patterns/page-header'
import { AppSettings } from '@/components/pwa/app-settings'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { getAccount } from '@/modules/auth/account'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Your account' }

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/bookings', label: 'Your bookings', icon: CalendarCheck },
  { href: '/favorites', label: 'Saved professionals', icon: Heart },
  { href: '/support', label: 'Help and support', icon: LifeBuoy },
]

export default async function ProfilePage() {
  const actor = await requirePageActor('CUSTOMER')
  const account = await getAccount(actor)

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title="Your account" />
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Your details</h2>
        </CardHeader>
        <CardContent>
          <AccountForm
            name={account.name ?? ''}
            email={account.email ?? ''}
            phone={account.phone}
          />
        </CardContent>
      </Card>
      <AppSettings />
      <nav aria-label="Account">
        <ul className="flex flex-col gap-3">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4 hover:border-brand-600"
              >
                <l.icon aria-hidden="true" className="size-5 text-brand-700" />
                <span className="flex-1 font-medium">{l.label}</span>
                <ChevronRight aria-hidden="true" className="size-4 text-ink-600" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="text-sm text-ink-600">
        <Link href="/terms" className="font-medium text-brand-700 underline">
          Terms of use
        </Link>
        {' · '}
        <Link href="/privacy" className="font-medium text-brand-700 underline">
          Privacy policy
        </Link>
      </p>
      <SignOutButton className="self-start" />
    </div>
  )
}
