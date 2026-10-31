import { en } from '@/i18n/messages/en'
import { createTranslator, type Translate } from '@/i18n/translate'

const english = createTranslator(en)

/**
 * Plain-language status labels (one persisted state can read differently per viewer).
 * Pass the page's `t` for the visitor's language; English otherwise (admin console).
 */
export function statusLabel(
  status: string,
  viewer: 'customer' | 'worker',
  counterpart: string,
  t: Translate = english,
): string {
  const name = { name: counterpart }
  switch (status) {
    case 'REQUESTED':
      return viewer === 'customer' ? t('status.waitingFor', name) : t('status.newRequest')
    case 'NEGOTIATING':
      return t('status.agreeing')
    case 'CONFIRMED':
      return t('status.confirmed')
    case 'EN_ROUTE':
      return viewer === 'customer' ? t('status.onTheWayName', name) : t('status.onTheWay')
    case 'ARRIVED':
      return viewer === 'customer' ? t('status.arrivedName', name) : t('status.arrived')
    case 'IN_PROGRESS':
      return t('status.inProgress')
    case 'COMPLETED':
      return t('status.completed')
    case 'CANCELLED':
      return t('status.cancelled')
    case 'EXPIRED':
      return t('status.expiredLong')
    case 'DISPUTED':
      return t('status.underReviewLong')
    default:
      return status
  }
}

export type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

/** Badge colour for a status: amber while waiting, brand while active, green when done. */
export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'REQUESTED':
    case 'NEGOTIATING':
      return 'warning'
    case 'CONFIRMED':
      return 'info'
    case 'EN_ROUTE':
    case 'ARRIVED':
    case 'IN_PROGRESS':
      return 'brand'
    case 'COMPLETED':
      return 'success'
    case 'DISPUTED':
      return 'danger'
    default:
      return 'neutral'
  }
}

/** Short badge text (the long `statusLabel` reads as a sentence). */
export function statusBadgeLabel(status: string, t: Translate = english): string {
  switch (status) {
    case 'REQUESTED':
      return t('status.requested')
    case 'NEGOTIATING':
      return t('status.agreeingShort')
    case 'CONFIRMED':
      return t('status.confirmed')
    case 'EN_ROUTE':
      return t('status.onTheWay')
    case 'ARRIVED':
      return t('status.arrived')
    case 'IN_PROGRESS':
      return t('status.inProgressShort')
    case 'COMPLETED':
      return t('status.completed')
    case 'CANCELLED':
      return t('status.cancelled')
    case 'EXPIRED':
      return t('status.expired')
    case 'DISPUTED':
      return t('status.underReview')
    default:
      return status.charAt(0) + status.slice(1).toLowerCase()
  }
}
