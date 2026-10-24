import { describe, expect, it } from 'vitest'
import { formatIstDateTime, toIstParts } from './time'

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
