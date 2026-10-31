import { CalendarCheck, ChevronRight, Heart, LifeBuoy, type LucideIcon } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { AccountForm } from '@/components/domain/account/account-form'
import { UnblockButton } from '@/components/domain/professionals/block-button'
import { PageHeader } from '@/components/patterns/page-header'
import { AppSettings } from '@/components/pwa/app-settings'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { getAccount } from '@/modules/auth/account'
import { requirePageActor } from '@/modules/auth/page-guards'
import { listBlocked } from '@/modules/favorites/blocks'
import { ownCustomerRating } from '@/modules/reviews/customer-ratings'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('account.metaTitle') }
}

const LINKS: { href: string; label: MessageKey; icon: LucideIcon }[] = [
  { href: '/bookings', label: 'account.bookings', icon: CalendarCheck },
  { href: '/favorites', label: 'account.saved', icon: Heart },
  { href: '/support', label: 'account.help', icon: LifeBuoy },
]

export default async function ProfilePage() {
  const actor = await requirePageActor('CUSTOMER')
  const [account, t, rating, blocked] = await Promise.all([
    getAccount(actor),
    getT(),
    ownCustomerRating(actor.userId),
    listBlocked(actor),
  ])

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title={t('account.title')} />
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t('account.details')}</h2>
        </CardHeader>
        <CardContent>
          <AccountForm
            name={account.name ?? ''}
            email={account.email ?? ''}
            phone={account.phone}
          />
        </CardContent>
      </Card>
      {rating && (
        <Card>
          <CardContent className="flex flex-col gap-1">
            <h2 className="font-semibold">{t('rateCustomer.yourRating')}</h2>
            <p className="text-sm text-ink-600">
              {t('rateCustomer.yourRatingBody', {
                avg: rating.avg.toFixed(1),
                count: rating.count,
              })}
            </p>
          </CardContent>
        </Card>
      )}
      {blocked.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">{t('blocks.title')}</h2>
            <p className="text-sm text-ink-600">{t('blocks.listBody')}</p>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {blocked.map((b) => (
                <li
                  key={b.workerId}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="font-medium">{b.displayName}</span>
                  <UnblockButton workerId={b.workerId} name={b.displayName} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <AppSettings />
      <nav aria-label={t('account.nav')}>
        <ul className="flex flex-col gap-3">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface px-4 hover:border-brand-600"
              >
                <l.icon aria-hidden="true" className="size-5 text-brand-700" />
                <span className="flex-1 font-medium">{t(l.label)}</span>
                <ChevronRight aria-hidden="true" className="size-4 text-ink-600" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="text-sm text-ink-600">
        <Link href="/terms" className="font-medium text-brand-700 underline">
          {t('account.terms')}
        </Link>
        {' · '}
        <Link href="/privacy" className="font-medium text-brand-700 underline">
          {t('account.privacy')}
        </Link>
      </p>
      <SignOutButton className="self-start" />
    </div>
  )
}
