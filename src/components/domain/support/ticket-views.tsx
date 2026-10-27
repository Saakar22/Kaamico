import { LifeBuoy } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatIstDateTime } from '@/lib/time'
import { TICKET_CATEGORY_LABELS } from '@/modules/support/labels'
import type { TicketSummary, TicketThread } from '@/modules/support/support'
import { TicketReplyForm } from './ticket-reply-form'

const STATUS: Record<
  TicketSummary['status'],
  { label: string; tone: 'info' | 'warning' | 'success' | 'neutral' }
> = {
  OPEN: { label: 'Waiting for Kaamico', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
}

export function TicketStatusBadge({ status }: { status: TicketSummary['status'] }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
}

/** The person's own help requests, most recent activity first. */
export function TicketList({ tickets, basePath }: { tickets: TicketSummary[]; basePath: string }) {
  if (tickets.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={LifeBuoy}
          title="No help requests yet"
          description="Anything you send us appears here with our replies."
        />
      </Card>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link
            href={`${basePath}/${t.id}`}
            className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 hover:border-brand-600"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{t.subject}</span>
              <TicketStatusBadge status={t.status} />
              {t.awaitingOwner && t.status === 'IN_PROGRESS' && (
                <Badge tone="brand">New reply</Badge>
              )}
            </span>
            <span className="text-sm text-ink-600">
              {TICKET_CATEGORY_LABELS[t.category]}
              {t.bookingCode && ` · ${t.bookingCode}`} ·{' '}
              {formatIstDateTime(new Date(t.lastMessageAt))}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Messages in a request; `viewer` decides how senders are named. */
export function TicketMessages({
  ticket,
  viewer,
}: {
  ticket: TicketThread
  viewer: 'owner' | 'admin'
}) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Messages">
      {ticket.messages.map((m) => {
        const mine = viewer === 'admin' ? m.fromKaamico : !m.fromKaamico
        const name = m.fromKaamico
          ? viewer === 'admin'
            ? `${m.senderName ?? 'Admin'} (Kaamico)`
            : 'Kaamico support'
          : viewer === 'admin'
            ? (m.senderName ?? 'Customer')
            : 'You'
        return (
          <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <Card className={cn('max-w-[85%]', mine && 'bg-brand-50')}>
              <CardContent className="flex flex-col gap-1 py-3">
                <span className="text-xs text-ink-600">
                  {name} · {formatIstDateTime(new Date(m.createdAt))}
                </span>
                <p className="whitespace-pre-line">{m.body}</p>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ol>
  )
}

/** Thread plus reply box (or a closed note) for the request's owner. */
export function OwnerTicketThread({ ticket }: { ticket: TicketThread }) {
  return (
    <div className="flex flex-col gap-4">
      <TicketMessages ticket={ticket} viewer="owner" />
      {ticket.status === 'CLOSED' ? (
        <p className="text-ink-600" role="status">
          This request is closed. If you still need help, start a new one.
        </p>
      ) : (
        <TicketReplyForm
          ticketId={ticket.id}
          hint={
            ticket.status === 'RESOLVED'
              ? 'Writing again reopens this request.'
              : 'We usually reply within a day.'
          }
        />
      )}
    </div>
  )
}
