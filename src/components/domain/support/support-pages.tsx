import { ChevronLeft, Phone } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AppError } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { TICKET_CATEGORY_LABELS } from '@/modules/support/labels'
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
  const [tickets, booking] = await Promise.all([
    listMyTickets(actor),
    bookingRefFor(actor, bookingId),
  ])
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Help and support"
        description="Ask Kaamico about a booking, a payment or your account. To report a problem with a job, use the button on the job itself."
      />
      <p
        className="flex items-center gap-2 rounded-lg border border-danger-700/30 bg-danger-700/5 p-3 text-sm"
        role="note"
      >
        <Phone aria-hidden="true" className="size-4 shrink-0 text-danger-700" />
        In an emergency, call 112 first.
      </p>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Ask Kaamico</h2>
        </CardHeader>
        <CardContent>
          <TicketForm basePath={basePath} booking={booking} />
        </CardContent>
      </Card>
      <section aria-labelledby="tickets-title" className="flex flex-col gap-3">
        <h2 id="tickets-title" className="font-display text-xl font-bold">
          Your requests
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
        Help and support
      </Link>
      <PageHeader
        title={ticket.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            {TICKET_CATEGORY_LABELS[ticket.category]}
            {ticket.bookingCode && ` · ${ticket.bookingCode}`}
          </span>
        }
      />
      <OwnerTicketThread ticket={ticket} />
    </div>
  )
}
