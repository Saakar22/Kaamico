export type PricingUnit = 'PER_VISIT' | 'PER_HOUR' | 'PER_ITEM' | 'PER_SQFT' | 'FIXED'

const SUFFIX: Record<PricingUnit, string> = {
  PER_VISIT: '/ visit',
  PER_HOUR: '/ hour',
  PER_ITEM: '/ item',
  PER_SQFT: '/ sq ft',
  FIXED: 'fixed price',
}

const SPOKEN: Record<PricingUnit, string> = {
  PER_VISIT: 'per visit',
  PER_HOUR: 'per hour',
  PER_ITEM: 'per item',
  PER_SQFT: 'per square foot',
  FIXED: 'fixed price',
}

/** Short suffix after a price, e.g. "₹450 / visit". */
export function unitSuffix(unit: PricingUnit): string {
  return SUFFIX[unit]
}

/** Words for screen readers, e.g. "per square foot". */
export function unitSpoken(unit: PricingUnit): string {
  return SPOKEN[unit]
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}
