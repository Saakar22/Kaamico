import { ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { htmlLang } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { formatIstDateTime } from '@/lib/time'
import type { DisputeView } from '@/modules/disputes/disputes'
import { disputeOutcomeLabel, disputeReasonLabel } from '@/modules/disputes/labels'
import { DisputeNoteForm } from './dispute-note-form'

/** A reported problem on a booking, as its customer or professional sees it. */
export async function DisputePanel({
  dispute,
  viewer,
}: {
  dispute: DisputeView
  viewer: 'CUSTOMER' | 'WORKER'
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const lang = htmlLang[locale]
  const open = dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW'
  const byMe = dispute.raisedBy === viewer
  const who = (by: string) =>
    by === viewer
      ? t('dispute.you')
      : by === 'ADMIN'
        ? t('dispute.kaamico')
        : by === 'CUSTOMER'
          ? t('dispute.customer')
          : t('dispute.professional')

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert aria-hidden="true" className="size-5 text-warning-800" />
          {byMe ? t('dispute.youReported') : t('dispute.reported')}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
          <Badge tone={open ? 'warning' : 'neutral'}>
            {open ? t('dispute.lookingInto') : t('dispute.closed')}
          </Badge>
          <span>
            {disputeReasonLabel(dispute.reason, locale)} ·{' '}
            {formatIstDateTime(new Date(dispute.createdAt), lang)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {byMe && <p className="text-ink-600">“{dispute.description}”</p>}
        {!open && (
          <div className="rounded-md bg-surface-muted p-3" role="status">
            <p className="font-medium">
              {dispute.outcome ? disputeOutcomeLabel(dispute.outcome, locale) : t('dispute.closed')}
              {dispute.refundedPaise > 0 && (
                <>
                  {' · '}
                  <Money paise={dispute.refundedPaise} /> {t('dispute.refunded')}
                </>
              )}
            </p>
            {dispute.resolutionNote && <p className="mt-1 text-sm">{dispute.resolutionNote}</p>}
          </div>
        )}
        {dispute.notes.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label={t('dispute.notes')}>
            {dispute.notes.map((n) => (
              <li key={n.id} className="text-sm">
                <span className="font-medium">{who(n.by)}:</span> {n.note}
                <span className="ml-2 text-xs text-ink-600">
                  {formatIstDateTime(new Date(n.createdAt), lang)}
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
