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

const formatters = new Map<string, Intl.DateTimeFormat>()

/** One formatter per language and style; `lang` "hi-IN" gives Hindi day and month names. */
function formatter(lang: string, style: 'dateTime' | 'time' | 'day'): Intl.DateTimeFormat {
  const key = `${lang}:${style}`
  let f = formatters.get(key)
  if (!f) {
    const options: Intl.DateTimeFormatOptions =
      style === 'time'
        ? { hour: 'numeric', minute: '2-digit', hour12: true }
        : style === 'day'
          ? { weekday: 'short', day: 'numeric', month: 'short' }
          : {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }
    f = new Intl.DateTimeFormat(lang, { timeZone: IST_TIME_ZONE, ...options })
    formatters.set(key, f)
  }
  return f
}

/** e.g. "Tue, 27 Oct, 10:30 am" */
export function formatIstDateTime(date: Date, lang = 'en-IN'): string {
  return formatter(lang, 'dateTime').format(date)
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

/** e.g. "10:30 am" */
export function formatIstTime(date: Date, lang = 'en-IN'): string {
  return formatter(lang, 'time').format(date)
}

/** The parts of a date stub in IST, e.g. { weekday: "Sun", day: "1", month: "Nov", time: "11:00 am" }. */
export function istDateStub(
  date: Date,
  lang = 'en-IN',
): { weekday: string; day: string; month: string; time: string } {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(lang, { timeZone: IST_TIME_ZONE, ...options }).format(date)
  return {
    weekday: part({ weekday: 'short' }),
    day: part({ day: 'numeric' }),
    month: part({ month: 'short' }),
    time: formatIstTime(date, lang),
  }
}

const RELATIVE_DAYS: Record<string, [today: string, tomorrow: string]> = {
  'en-IN': ['Today', 'Tomorrow'],
  'hi-IN': ['आज', 'कल'],
}

/** "Today", "Tomorrow" or e.g. "Thu, 29 Oct" relative to `now`. */
export function formatIstDay(date: Date, now: Date = new Date(), lang = 'en-IN'): string {
  const [today, tomorrow] = RELATIVE_DAYS[lang] ?? RELATIVE_DAYS['en-IN']
  const key = istDateKey(date)
  if (key === istDateKey(now)) return today
  if (key === istDateKey(new Date(now.getTime() + 24 * 60 * MINUTE_MS))) return tomorrow
  return formatter(lang, 'day').format(date)
}
