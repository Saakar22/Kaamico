import { describe, expect, it } from 'vitest'
import { fromIst, formatIstDay, formatIstTime } from '@/lib/time'
import { languageNames } from '@/modules/professionals/languages'
import { formatDuration, unitSpoken, unitSuffix } from './units'

describe('units, durations and dates in Hindi', () => {
  it('formats durations and price units in either language', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(90)).toBe('1 hr 30 min')
    expect(formatDuration(90, 'hi')).toBe('1 घंटा 30 मिनट')
    expect(formatDuration(120, 'hi')).toBe('2 घंटा')
    expect(unitSuffix('PER_VISIT')).toBe('/ visit')
    expect(unitSuffix('PER_VISIT', 'hi')).toBe('/ विज़िट')
    expect(unitSpoken('PER_SQFT', 'hi')).toBe('प्रति वर्ग फ़ुट')
  })

  it('says today and tomorrow in Hindi', () => {
    const now = fromIst(2026, 10, 29, 9 * 60)
    expect(formatIstDay(fromIst(2026, 10, 29, 14 * 60), now, 'hi-IN')).toBe('आज')
    expect(formatIstDay(fromIst(2026, 10, 30, 14 * 60), now, 'hi-IN')).toBe('कल')
    expect(formatIstDay(fromIst(2026, 10, 30, 14 * 60), now)).toBe('Tomorrow')
    expect(formatIstTime(fromIst(2026, 10, 29, 14 * 60))).toBe('2:00 pm')
  })

  it('names languages in the reader’s language', () => {
    expect(languageNames(['mr', 'hi'])).toBe('Marathi, Hindi')
    expect(languageNames(['mr', 'hi'], 'hi-IN')).toBe('मराठी, हिन्दी')
  })
})
