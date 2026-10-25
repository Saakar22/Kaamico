import { describe, expect, it } from 'vitest'
import { formatIstDateTime, formatIstDay, fromIst, istDateKey, toIstParts } from './time'

describe('toIstParts', () => {
  it('converts UTC to IST (+05:30)', () => {
    // 2026-10-26T18:45Z is Tuesday 27 Oct 00:15 IST
    expect(toIstParts(new Date('2026-10-26T18:45:00Z'))).toEqual({
      year: 2026,
      month: 10,
      day: 27,
      weekday: 1,
      minuteOfDay: 15,
    })
  })

  it('numbers weekdays from Monday = 0', () => {
    expect(toIstParts(new Date('2026-10-26T04:30:00Z')).weekday).toBe(0) // Mon 10:00 IST
    expect(toIstParts(new Date('2026-11-01T04:30:00Z')).weekday).toBe(6) // Sun 10:00 IST
  })
})

describe('formatIstDateTime', () => {
  it('formats in IST', () => {
    expect(formatIstDateTime(new Date('2026-10-27T05:00:00Z'))).toMatch(/Tue, 27 Oct, 10:30\s?am/i)
  })
})

describe('fromIst / istDateKey', () => {
  it('builds an instant from an IST wall-clock time', () => {
    expect(fromIst(2026, 10, 27, 10 * 60 + 30).toISOString()).toBe('2026-10-27T05:00:00.000Z')
    expect(fromIst(2026, 10, 27, 0).toISOString()).toBe('2026-10-26T18:30:00.000Z')
  })

  it('keys dates by the IST calendar day', () => {
    expect(istDateKey(new Date('2026-10-26T18:45:00Z'))).toBe('2026-10-27')
    expect(istDateKey(new Date('2026-10-26T18:15:00Z'))).toBe('2026-10-26')
  })
})

describe('formatIstDay', () => {
  const now = new Date('2026-10-27T05:00:00Z') // Tue 10:30 IST
  it('says Today and Tomorrow, then the date', () => {
    expect(formatIstDay(new Date('2026-10-27T15:00:00Z'), now)).toBe('Today')
    expect(formatIstDay(new Date('2026-10-28T03:00:00Z'), now)).toBe('Tomorrow')
    expect(formatIstDay(new Date('2026-10-29T03:00:00Z'), now)).toMatch(/Thu, 29 Oct/)
  })
})
