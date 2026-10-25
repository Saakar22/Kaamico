import { describe, expect, it } from 'vitest'
import { fromIst } from '@/lib/time'
import { earliestStart, freeStarts, isSlotFree, nextFreeStart, type SlotOptions } from './slots'

// Mon 26 Oct 2026 is weekday 0.
const mon = (minute: number) => fromIst(2026, 10, 26, minute)
const tue = (minute: number) => fromIst(2026, 10, 27, minute)
const h = (hours: number, minutes = 0) => hours * 60 + minutes

const base: SlotOptions = {
  rules: [
    { weekday: 0, startMinute: h(9), endMinute: h(12) },
    { weekday: 1, startMinute: h(14), endMinute: h(16) },
  ],
  busy: [],
  durationMin: 60,
  bufferMin: 30,
  gridMin: 30,
  from: mon(0),
  until: fromIst(2026, 10, 28),
}

const iso = (dates: Iterable<Date>) => [...dates].map((d) => d.toISOString())

describe('freeStarts', () => {
  it('lists grid starts that fit inside each working window', () => {
    expect(iso(freeStarts(base))).toEqual(
      iso([
        mon(h(9)),
        mon(h(9, 30)),
        mon(h(10)),
        mon(h(10, 30)),
        mon(h(11)),
        tue(h(14)),
        tue(h(14, 30)),
        tue(h(15)),
      ]),
    )
  })

  it('skips starts that clash with a booking, including the buffer after the new job', () => {
    // Booked 10:30–11:30. A 9:30 start would run to 10:30 plus a 30-minute buffer: clash.
    const busy = [{ start: mon(h(10, 30)), end: mon(h(11, 30)) }]
    const starts = iso(freeStarts({ ...base, busy, until: tue(0) }))
    expect(starts).toEqual(iso([mon(h(9))]))
  })

  it('respects the earliest start and the horizon', () => {
    const starts = iso(freeStarts({ ...base, from: mon(h(10, 10)), until: tue(h(14, 30)) }))
    expect(starts).toEqual(iso([mon(h(10, 30)), mon(h(11)), tue(h(14))]))
  })

  it('returns nothing when the worker has no hours', () => {
    expect(nextFreeStart({ ...base, rules: [] })).toBeNull()
  })

  it('finds the next free start across days and time off', () => {
    const busy = [{ start: mon(0), end: tue(h(14, 30)) }]
    expect(nextFreeStart({ ...base, busy })?.toISOString()).toBe(tue(h(14, 30)).toISOString())
  })
})

describe('isSlotFree', () => {
  it('rejects jobs that would overrun the working window', () => {
    expect(isSlotFree(mon(h(11)), base)).toBe(true)
    expect(isSlotFree(mon(h(11, 30)), base)).toBe(false)
    expect(isSlotFree(tue(h(9)), base)).toBe(false)
  })

  it('lets a job end exactly when time off starts, buffer included', () => {
    const busy = [{ start: mon(h(11, 30)), end: mon(h(13)) }]
    expect(isSlotFree(mon(h(10)), { ...base, busy })).toBe(true)
    expect(isSlotFree(mon(h(10, 30)), { ...base, busy })).toBe(false)
  })
})

describe('earliestStart', () => {
  it('adds the lead time and rounds up to the grid', () => {
    expect(earliestStart(mon(h(9, 10)), 60, 30).toISOString()).toBe(mon(h(10, 30)).toISOString())
    expect(earliestStart(mon(h(9)), 60, 30).toISOString()).toBe(mon(h(10)).toISOString())
  })
})
