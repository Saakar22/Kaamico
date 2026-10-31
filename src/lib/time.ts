/** All scheduling rules are evaluated in India Standard Time. */
export const IST_TIME_ZONE = 'Asia/Kolkata'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export type IstParts = {
  year: number
  month: number
  day: number
  /** 0 = Monday … 6 = Sunday (matches worker availability rules). */
  weekday: number
  /** Minutes since IST midnight, 0–1439. */
  minuteOfDay: number
}

export function toIstParts(date: Date): IstParts {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS.indexOf(parts.weekday as (typeof WEEKDAYS)[number]),
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

const displayOptions: Intl.DateTimeFormatOptions = {
  timeZone: IST_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
}
const displayFormatters = new Map<string, Intl.DateTimeFormat>()

/** e.g. "Tue, 27 Oct, 10:30 am"; `lang` "hi-IN" gives Hindi day and month names. */
export function formatIstDateTime(date: Date, lang = 'en-IN'): string {
  let formatter = displayFormatters.get(lang)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(lang, displayOptions)
    displayFormatters.set(lang, formatter)
  }
  return formatter.format(date)
}

const MINUTE_MS = 60_000
/** IST is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MINUTES = 330

/** The instant for a wall-clock time in IST, e.g. fromIst(2026, 10, 27, 600) = 27 Oct 10:00 IST. */
export function fromIst(year: number, month: number, day: number, minuteOfDay = 0): Date {
  return new Date(Date.UTC(year, month - 1, day) + (minuteOfDay - IST_OFFSET_MINUTES) * MINUTE_MS)
}

/** IST calendar date as YYYY-MM-DD. */
export function istDateKey(date: Date): string {
  const { year, month, day } = toIstParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const dayFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** e.g. "10:30 am" */
export function formatIstTime(date: Date): string {
  return timeFormatter.format(date)
}

/** "Today", "Tomorrow" or e.g. "Thu, 29 Oct" relative to `now`. */
export function formatIstDay(date: Date, now: Date = new Date()): string {
  const key = istDateKey(date)
  if (key === istDateKey(now)) return 'Today'
  if (key === istDateKey(new Date(now.getTime() + 24 * 60 * MINUTE_MS))) return 'Tomorrow'
  return dayFormatter.format(date)
}
