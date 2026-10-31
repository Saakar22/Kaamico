import { LifeBuoy } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { formatIstDateTime } from '@/lib/time'
import { ticketCategoryLabel } from '@/modules/support/labels'
import type { TicketSummary, TicketThread } from '@/modules/support/support'
import { TicketReplyForm } from './ticket-reply-form'

const STATUS: Record<
  TicketSummary['status'],
  { label: MessageKey; tone: 'info' | 'warning' | 'success' | 'neutral' }
> = {
  OPEN: { label: 'support.statusOpen', tone: 'info' },
  IN_PROGRESS: { label: 'support.statusInProgress', tone: 'warning' },
  RESOLVED: { label: 'support.statusResolved', tone: 'success' },
  CLOSED: { label: 'support.statusClosed', tone: 'neutral' },
}

export async function TicketStatusBadge({ status }: { status: TicketSummary['status'] }) {
  const t = await getT()
  return <Badge tone={STATUS[status].tone}>{t(STATUS[status].label)}</Badge>
}

/** The person's own help requests, most recent activity first. */
export async function TicketList({
  tickets,
  basePath,
}: {
  tickets: TicketSummary[]
  basePath: string
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  if (tickets.length === 0) {
    return (
      <Card>
        <EmptyState icon={LifeBuoy} title={t('support.none')} description={t('support.noneBody')} />
      </Card>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <Link
            href={`${basePath}/${ticket.id}`}
            className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4 hover:border-brand-600"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{ticket.subject}</span>
              <TicketStatusBadge status={ticket.status} />
              {ticket.awaitingOwner && ticket.status === 'IN_PROGRESS' && (
                <Badge tone="brand">{t('support.newReply')}</Badge>
              )}
            </span>
            <span className="text-sm text-ink-600">
              {ticketCategoryLabel(ticket.category, locale)}
              {ticket.bookingCode && ` · ${ticket.bookingCode}`} ·{' '}
              {formatIstDateTime(new Date(ticket.lastMessageAt), htmlLang[locale])}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Messages in a request; `viewer` decides how senders are named. */
export async function TicketMessages({
  ticket,
  viewer,
}: {
  ticket: TicketThread
  viewer: 'owner' | 'admin'
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  return (
    <ol className="flex flex-col gap-3" aria-label={t('support.messages')}>
      {ticket.messages.map((m) => {
        const mine = viewer === 'admin' ? m.fromKaamico : !m.fromKaamico
        const name = m.fromKaamico
          ? viewer === 'admin'
            ? `${m.senderName ?? 'Admin'} (Kaamico)`
            : t('support.kaamicoSupport')
          : viewer === 'admin'
            ? (m.senderName ?? 'Customer')
            : t('support.you')
        return (
          <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <Card className={cn('max-w-[85%]', mine && 'bg-brand-50')}>
              <CardContent className="flex flex-col gap-1 py-3">
                <span className="text-xs text-ink-600">
                  {name} · {formatIstDateTime(new Date(m.createdAt), htmlLang[locale])}
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
export async function OwnerTicketThread({ ticket }: { ticket: TicketThread }) {
  const t = await getT()
  return (
    <div className="flex flex-col gap-4">
      <TicketMessages ticket={ticket} viewer="owner" />
      {ticket.status === 'CLOSED' ? (
        <p className="text-ink-600" role="status">
          {t('support.closedNote')}
        </p>
      ) : (
        <TicketReplyForm
          ticketId={ticket.id}
          hint={ticket.status === 'RESOLVED' ? t('support.reopens') : t('support.replyTime')}
        />
      )}
    </div>
  )
}
