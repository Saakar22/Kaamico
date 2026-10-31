import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TicketStatusButtons } from '@/components/domain/admin/ticket-status-buttons'
import { TicketReplyForm } from '@/components/domain/support/ticket-reply-form'
import { TicketMessages, TicketStatusBadge } from '@/components/domain/support/ticket-views'
import { PageHeader } from '@/components/patterns/page-header'
import { AppError } from '@/lib/errors'
import { requirePageActor } from '@/modules/auth/page-guards'
import type { Actor } from '@/modules/auth/types'
import { TICKET_CATEGORY_LABELS } from '@/modules/support/labels'
import { getTicket } from '@/modules/support/support'

export const instant = false

export const metadata: Metadata = { title: 'Help request' }

async function load(actor: Actor, id: string) {
  try {
    return await getTicket(actor, id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

export default async function AdminTicketPage({ params }: PageProps<'/[lang]/admin/support/[id]'>) {
  const admin = await requirePageActor('ADMIN')
  const ticket = await load(admin, (await params).id)

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        href="/admin/support"
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Support
      </Link>
      <PageHeader
        title={ticket.subject}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            {TICKET_CATEGORY_LABELS[ticket.category]} · from {ticket.ownerName ?? 'a user'}
            {ticket.bookingId && (
              <Link
                href={`/admin/bookings/${ticket.bookingId}`}
                className="text-brand-700 underline"
              >
                {ticket.bookingCode}
              </Link>
            )}
          </span>
        }
        actions={<TicketStatusButtons ticketId={ticket.id} status={ticket.status} />}
      />
      <TicketMessages ticket={ticket} viewer="admin" />
      {ticket.status !== 'CLOSED' && (
        <TicketReplyForm
          ticketId={ticket.id}
          label="Reply as Kaamico support"
          hint="The person is notified. Your name is not shown to them."
        />
      )}
    </div>
  )
}
