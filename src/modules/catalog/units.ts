import type { Locale } from '@/i18n/config'

export type PricingUnit = 'PER_VISIT' | 'PER_HOUR' | 'PER_ITEM' | 'PER_SQFT' | 'FIXED'

const SUFFIX: Record<Locale, Record<PricingUnit, string>> = {
  en: {
    PER_VISIT: '/ visit',
    PER_HOUR: '/ hour',
    PER_ITEM: '/ item',
    PER_SQFT: '/ sq ft',
    FIXED: 'fixed price',
  },
  hi: {
    PER_VISIT: '/ विज़िट',
    PER_HOUR: '/ घंटा',
    PER_ITEM: '/ नग',
    PER_SQFT: '/ वर्ग फ़ुट',
    FIXED: 'तय दाम',
  },
}

const SPOKEN: Record<Locale, Record<PricingUnit, string>> = {
  en: {
    PER_VISIT: 'per visit',
    PER_HOUR: 'per hour',
    PER_ITEM: 'per item',
    PER_SQFT: 'per square foot',
    FIXED: 'fixed price',
  },
  hi: {
    PER_VISIT: 'प्रति विज़िट',
    PER_HOUR: 'प्रति घंटा',
    PER_ITEM: 'प्रति नग',
    PER_SQFT: 'प्रति वर्ग फ़ुट',
    FIXED: 'तय दाम',
  },
}

/** Short suffix after a price, e.g. "₹450 / visit". */
export function unitSuffix(unit: PricingUnit, locale: Locale = 'en'): string {
  return SUFFIX[locale][unit]
}

/** Words for screen readers, e.g. "per square foot". */
export function unitSpoken(unit: PricingUnit, locale: Locale = 'en'): string {
  return SPOKEN[locale][unit]
}

/** "45 min", "1 hr", "1 hr 30 min" (Hindi: "45 मिनट", "1 घंटा 30 मिनट"). */
export function formatDuration(minutes: number, locale: Locale = 'en'): string {
  const [hr, min] = locale === 'hi' ? ['घंटा', 'मिनट'] : ['hr', 'min']
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} ${min}`
  return m === 0 ? `${h} ${hr}` : `${h} ${hr} ${m} ${min}`
}
