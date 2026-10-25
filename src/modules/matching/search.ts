import 'server-only'
import { z } from 'zod'
import { businessRule, notFound } from '@/lib/errors'
import { istDateKey, toIstParts } from '@/lib/time'
import { earliestStart, nextFreeStart } from '@/modules/availability/slots'
import { getService, type ServiceDetail } from '@/modules/catalog/catalog'
import type { PricingUnit } from '@/modules/catalog/units'
import { latitude, longitude } from '@/modules/location/location'
import { matchingConfig as config } from './config'
import { findCandidates, loadSchedules, type CandidateRow, type Timing } from './repo'
import {
  arrivalEstimate,
  bayesianRating,
  expandRadius,
  injectNewWorker,
  isNewWorker,
  rank,
  type ArrivalEstimate,
  type SortKey,
} from './scoring'

const MAX_PAISE = 10_000_000

export const professionalSearchSchema = z.object({
  serviceId: z.uuid(),
  lat: latitude,
  lng: longitude,
  /** "now" for on-demand, an ISO time for a scheduled job, or absent for "any time". */
  when: z.union([z.literal('now'), z.iso.datetime({ offset: true })]).optional(),
  /** Used for price-fit ranking only. */
  budgetPaise: z.coerce.number().int().positive().max(MAX_PAISE).optional(),
  /** Hard filter: listed price at or below this. */
  maxPricePaise: z.coerce.number().int().positive().max(MAX_PAISE).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  sort: z.enum(['recommended', 'price', 'rating', 'distance']).default('recommended'),
  /** Opaque paging cursor from a previous response. */
  cursor: z
    .string()
    .regex(/^\d{1,4}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(config.pageSize),
})

export type ProfessionalSearchQuery = z.input<typeof professionalSearchSchema>

export type ProfessionalResult = {
  workerId: string
  displayName: string
  photoUrl: string | null
  verified: true
  rating: { avg: number | null; count: number }
  completedJobs: number
  isNew: boolean
  yearsExperience: number
  languages: string[]
  /** Straight-line distance, one decimal. */
  distanceKm: number
  /** Only for workers who could set off now. */
  approxArrival: ArrivalEstimate | null
  price: { paise: number; unit: PricingUnit; minChargePaise: number; negotiable: boolean }
  availability: { now: boolean; nextSlot: string | null }
}

export type ProfessionalSearchResult = {
  service: ServiceDetail
  radiusKm: number
  total: number
  items: ProfessionalResult[]
  nextCursor: string | null
  /** When nobody is free right now: the earliest scheduled options nearby. */
  scheduledAlternatives: { workerId: string; displayName: string; start: string }[]
}

type Enriched = CandidateRow & { nextSlot: Date | null }

function parseTiming(when: string | undefined, now: Date): Timing {
  if (when === undefined) return { kind: 'flexible' }
  if (when === 'now') return { kind: 'now' }
  const start = new Date(when)
  if (start.getTime() < now.getTime()) {
    throw businessRule('WHEN_IN_PAST', 'Choose a time in the future')
  }
  if (start.getTime() > now.getTime() + config.scheduling.maxAheadDays * 24 * 60 * 60_000) {
    throw businessRule(
      'WHEN_TOO_FAR',
      `You can book up to ${config.scheduling.maxAheadDays} days ahead`,
    )
  }
  const { weekday, minuteOfDay } = toIstParts(start)
  return { kind: 'at', start, weekday, startMinute: minuteOfDay }
}

/** Adds each candidate's next free start and drops those with no upcoming availability. */
async function withNextSlots(
  rows: CandidateRow[],
  timing: Timing,
  durationMin: number,
  now: Date,
): Promise<Enriched[]> {
  if (timing.kind === 'at') return rows.map((r) => ({ ...r, nextSlot: timing.start }))
  const { leadMinutes, gridMinutes, horizonDays } = config.scheduling
  const from = earliestStart(now, leadMinutes, gridMinutes)
  const until = new Date(from.getTime() + horizonDays * 24 * 60 * 60_000)
  const schedules = await loadSchedules(
    rows.map((r) => r.workerId),
    from,
    new Date(until.getTime() + (durationMin + config.bufferMinutes) * 60_000),
  )
  const enriched = rows.map((r) => {
    const schedule = schedules.get(r.workerId)!
    const nextSlot = nextFreeStart({
      ...schedule,
      durationMin,
      bufferMin: config.bufferMinutes,
      gridMin: gridMinutes,
      from,
      until,
    })
    return { ...r, nextSlot }
  })
  // "Any time" needs someone who can come now or has free hours this week.
  return timing.kind === 'flexible'
    ? enriched.filter((r) => r.availableNow || r.nextSlot)
    : enriched
}

function toResult(r: Enriched): ProfessionalResult {
  return {
    workerId: r.workerId,
    displayName: r.displayName,
    // Profile photos arrive with worker uploads (Phase 6).
    photoUrl: null,
    verified: true,
    rating: {
      avg: r.ratingCount > 0 ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null,
      count: r.ratingCount,
    },
    completedJobs: r.completedJobs,
    isNew: isNewWorker(r.completedJobs),
    yearsExperience: r.yearsExperience,
    languages: r.languages,
    distanceKm: Math.round(r.distanceKm * 10) / 10,
    approxArrival: r.availableNow ? arrivalEstimate(r.distanceKm) : null,
    price: {
      paise: r.pricePaise,
      unit: r.unit,
      minChargePaise: r.minChargePaise,
      negotiable: r.isNegotiable,
    },
    availability: { now: r.availableNow, nextSlot: r.nextSlot?.toISOString() ?? null },
  }
}

/** Ranked professionals for a service near a point (IMPLEMENTATION_PLAN.md §11.1). */
export async function searchProfessionals(
  input: ProfessionalSearchQuery | Record<string, string>,
  now: Date = new Date(),
): Promise<ProfessionalSearchResult> {
  const q = professionalSearchSchema.parse(input)
  const service = await getService(q.serviceId)
  if (!service) throw notFound('This service is not available')
  const timing = parseTiming(q.when, now)
  const durationMin = service.typicalDurationMin

  const find = async (radiusKm: number, t: Timing) => {
    const rows = await findCandidates({
      serviceId: service.id,
      lat: q.lat,
      lng: q.lng,
      radiusKm,
      durationMin,
      timing: t,
      now,
      maxPricePaise: q.maxPricePaise,
    })
    const filtered =
      q.minRating === undefined
        ? rows
        : rows.filter((r) => r.ratingCount > 0 && r.ratingSum / r.ratingCount >= q.minRating!)
    return withNextSlots(filtered, t, durationMin, now)
  }

  const { radiusKm, candidates } = await expandRadius((r) => find(r, timing))
  const ranked = rank(candidates, {
    sort: q.sort as SortKey,
    radiusKm,
    budgetPaise: q.budgetPaise ?? q.maxPricePaise,
    dateSeed: istDateKey(now),
  })
  const ordered = q.sort === 'recommended' ? injectNewWorker(ranked, config.pageSize) : ranked

  const offset = q.cursor ? Number(q.cursor) : 0
  const page = ordered.slice(offset, offset + q.limit)
  const nextOffset = offset + q.limit

  let scheduledAlternatives: ProfessionalSearchResult['scheduledAlternatives'] = []
  if (timing.kind === 'now' && ordered.length === 0) {
    const cap = config.radiiKm[config.radiiKm.length - 1]
    const later = await find(cap, { kind: 'flexible' })
    scheduledAlternatives = later
      .filter((r): r is Enriched & { nextSlot: Date } => r.nextSlot !== null)
      .sort(
        (a, b) =>
          a.nextSlot.getTime() - b.nextSlot.getTime() ||
          bayesianRating(b.ratingSum, b.ratingCount) - bayesianRating(a.ratingSum, a.ratingCount),
      )
      .slice(0, 3)
      .map((r) => ({
        workerId: r.workerId,
        displayName: r.displayName,
        start: r.nextSlot.toISOString(),
      }))
  }

  return {
    service,
    radiusKm,
    total: ordered.length,
    items: page.map(toResult),
    nextCursor: nextOffset < ordered.length ? String(nextOffset) : null,
    scheduledAlternatives,
  }
}
