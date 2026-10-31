import { ChevronLeft, Phone } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { getLocale, getT } from '@/i18n/server'
import { AppError } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { ticketCategoryLabel } from '@/modules/support/labels'
import { bookingRefFor, getTicket, listMyTickets } from '@/modules/support/support'
import { OwnerTicketThread, TicketList, TicketStatusBadge } from './ticket-views'
import { TicketForm } from './ticket-form'

type BasePath = '/support' | '/worker/support'

/** `/support` and `/worker/support`: ask Kaamico for help and see earlier requests. */
export async function SupportHome({
  actor,
  basePath,
  bookingId,
}: {
  actor: Actor
  basePath: BasePath
  bookingId?: string
}) {
  const [tickets, booking, t] = await Promise.all([
    listMyTickets(actor),
    bookingRefFor(actor, bookingId),
    getT(),
  ])
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t('support.title')} description={t('support.description')} />
      <p
        className="flex items-center gap-2 rounded-lg border border-danger-700/30 bg-danger-700/5 p-3 text-sm"
        role="note"
      >
        <Phone aria-hidden="true" className="size-4 shrink-0 text-danger-700" />
        {t('support.emergency')}
      </p>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t('support.ask')}</h2>
        </CardHeader>
        <CardContent>
          <TicketForm basePath={basePath} booking={booking} />
        </CardContent>
      </Card>
      <section aria-labelledby="tickets-title" className="flex flex-col gap-3">
        <h2 id="tickets-title" className="font-display text-xl font-semibold">
          {t('support.yourRequests')}
        </h2>
        <TicketList tickets={tickets} basePath={basePath} />
      </section>
    </div>
  )
}

/** One request and its replies, for its owner. */
export async function SupportThread({
  actor,
  basePath,
  ticketId,
}: {
  actor: Actor
  basePath: BasePath
  ticketId: string
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  let ticket
  try {
    ticket = await getTicket(actor, ticketId)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        href={basePath}
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t('support.title')}
      </Link>
      <PageHeader
        title={ticket.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            {ticketCategoryLabel(ticket.category, locale)}
            {ticket.bookingCode && ` · ${ticket.bookingCode}`}
          </span>
        }
      />
      <OwnerTicketThread ticket={ticket} />
    </div>
  )
}
