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

const displayFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** e.g. "Tue, 27 Oct, 10:30 am" */
export function formatIstDateTime(date: Date): string {
  return displayFormatter.format(date)
}
