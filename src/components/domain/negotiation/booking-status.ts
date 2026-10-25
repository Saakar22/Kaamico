/** Plain-language status labels (one persisted state can read differently per viewer). */
export function statusLabel(
  status: string,
  viewer: 'customer' | 'worker',
  counterpart: string,
): string {
  switch (status) {
    case 'REQUESTED':
      return viewer === 'customer' ? `Waiting for ${counterpart} to respond` : 'New request'
    case 'NEGOTIATING':
      return 'Agreeing a price'
    case 'CONFIRMED':
      return 'Confirmed'
    case 'EN_ROUTE':
      return viewer === 'customer' ? `${counterpart} is on the way` : 'On the way'
    case 'ARRIVED':
      return viewer === 'customer' ? `${counterpart} has arrived` : 'Arrived'
    case 'IN_PROGRESS':
      return 'Work in progress'
    case 'COMPLETED':
      return 'Completed'
    case 'CANCELLED':
      return 'Cancelled'
    case 'EXPIRED':
      return 'Expired: no price was agreed in time'
    case 'DISPUTED':
      return 'Under review by Kaamico'
    default:
      return status
  }
}
