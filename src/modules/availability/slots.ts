import { fromIst, toIstParts } from '@/lib/time'

/** A weekly working window in IST. 0 = Monday … 6 = Sunday; minutes since midnight. */
export type WeeklyRule = { weekday: number; startMinute: number; endMinute: number }

/** A half-open busy period [start, end): a booking slot or time off. */
export type Busy = { start: Date; end: Date }

export type SlotOptions = {
  rules: readonly WeeklyRule[]
  busy: readonly Busy[]
  /** Job length; the slot must fit inside a working window. */
  durationMin: number
  /** Added after the job when checking clashes (travel and wrap-up). */
  bufferMin: number
  /** Start times fall on this grid within each window, e.g. 10:00, 10:30. */
  gridMin: number
  /** Earliest allowed start. */
  from: Date
  /** Starts must be before this instant. */
  until: Date
}

const MINUTE = 60_000

const overlaps = (start: number, end: number, busy: readonly Busy[]) =>
  busy.some((b) => start < b.end.getTime() && b.start.getTime() < end)

/** True if a job starting at `start` fits a working window and clashes with nothing. */
export function isSlotFree(
  start: Date,
  options: Pick<SlotOptions, 'rules' | 'busy' | 'durationMin' | 'bufferMin'>,
): boolean {
  const { weekday, minuteOfDay } = toIstParts(start)
  const end = minuteOfDay + options.durationMin
  const inHours = options.rules.some(
    (r) => r.weekday === weekday && r.startMinute <= minuteOfDay && end <= r.endMinute,
  )
  if (!inHours) return false
  const t = start.getTime()
  return !overlaps(t, t + (options.durationMin + options.bufferMin) * MINUTE, options.busy)
}

/** Free start times in chronological order, lazily, so callers can stop at the first. */
export function* freeStarts(options: SlotOptions): Generator<Date> {
  const { rules, durationMin, gridMin, from, until } = options
  const first = toIstParts(from)
  // Walk IST calendar days; one extra day covers windows that started before `from`.
  for (let day = 0; ; day++) {
    const midnight = fromIst(first.year, first.month, first.day + day)
    if (midnight.getTime() >= until.getTime()) return
    const weekday = toIstParts(new Date(midnight.getTime() + 12 * 60 * MINUTE)).weekday
    const windows = rules
      .filter((r) => r.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute)
    for (const w of windows) {
      const firstStart = Math.ceil(w.startMinute / gridMin) * gridMin
      for (let m = firstStart; m + durationMin <= w.endMinute; m += gridMin) {
        const start = new Date(midnight.getTime() + m * MINUTE)
        if (start < from) continue
        if (start >= until) return
        if (isSlotFree(start, options)) yield start
      }
    }
    if (day > 400) return // Defensive: never loop forever on a bad `until`.
  }
}

export function nextFreeStart(options: SlotOptions): Date | null {
  return freeStarts(options).next().value ?? null
}

/** Earliest bookable instant: `leadMin` from now, rounded up to the grid. */
export function earliestStart(now: Date, leadMin: number, gridMin: number): Date {
  const grid = gridMin * MINUTE
  return new Date(Math.ceil((now.getTime() + leadMin * MINUTE) / grid) * grid)
}
