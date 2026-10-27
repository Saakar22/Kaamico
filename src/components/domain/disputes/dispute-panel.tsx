import { ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { formatIstDateTime } from '@/lib/time'
import type { DisputeView } from '@/modules/disputes/disputes'
import { DISPUTE_OUTCOME_LABELS, DISPUTE_REASON_LABELS } from '@/modules/disputes/labels'
import { DisputeNoteForm } from './dispute-note-form'

/** A reported problem on a booking, as its customer or professional sees it. */
export function DisputePanel({
  dispute,
  viewer,
}: {
  dispute: DisputeView
  viewer: 'CUSTOMER' | 'WORKER'
}) {
  const open = dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW'
  const byMe = dispute.raisedBy === viewer
  const who = (by: string) =>
    by === viewer
      ? 'You'
      : by === 'ADMIN'
        ? 'Kaamico'
        : by === 'CUSTOMER'
          ? 'Customer'
          : 'Professional'

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert aria-hidden="true" className="size-5 text-warning-800" />
          {byMe ? 'You reported a problem' : 'A problem was reported'}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
          <Badge tone={open ? 'warning' : 'neutral'}>
            {open ? 'Kaamico is looking into it' : 'Closed'}
          </Badge>
          <span>
            {DISPUTE_REASON_LABELS[dispute.reason]} ·{' '}
            {formatIstDateTime(new Date(dispute.createdAt))}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {byMe && <p className="text-ink-600">“{dispute.description}”</p>}
        {!open && (
          <div className="rounded-md bg-surface-muted p-3" role="status">
            <p className="font-medium">
              {dispute.outcome ? DISPUTE_OUTCOME_LABELS[dispute.outcome] : 'Closed'}
              {dispute.refundedPaise > 0 && (
                <>
                  {' · '}
                  <Money paise={dispute.refundedPaise} /> refunded
                </>
              )}
            </p>
            {dispute.resolutionNote && <p className="mt-1 text-sm">{dispute.resolutionNote}</p>}
          </div>
        )}
        {dispute.notes.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Notes">
            {dispute.notes.map((n) => (
              <li key={n.id} className="text-sm">
                <span className="font-medium">{who(n.by)}:</span> {n.note}
                <span className="ml-2 text-xs text-ink-600">
                  {formatIstDateTime(new Date(n.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {open && <DisputeNoteForm disputeId={dispute.id} />}
      </CardContent>
    </Card>
  )
}
