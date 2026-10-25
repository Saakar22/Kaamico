import { matchingConfig as config } from './config'

/** The facts about a candidate that ranking needs. Pure data: no I/O here. */
export type RankInput = {
  workerId: string
  distanceKm: number
  pricePaise: number
  ratingSum: number
  ratingCount: number
  completedJobs: number
  acceptedInvitations: number
  totalInvitations: number
  cancellationsByWorker: number
}

export type SortKey = 'recommended' | 'price' | 'rating' | 'distance'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Average pulled towards the platform mean until a worker has enough reviews. */
export function bayesianRating(ratingSum: number, ratingCount: number): number {
  const { mean, weight } = config.ratingPrior
  return (weight * mean + ratingSum) / (weight + ratingCount)
}

export function isNewWorker(completedJobs: number): boolean {
  return completedJobs < config.newWorkerJobs
}

export function reliabilityScore(c: RankInput): number {
  const { completion, acceptance, defaultRate } = config.reliability
  if (isNewWorker(c.completedJobs)) return defaultRate
  const finished = c.completedJobs + c.cancellationsByWorker
  const completionRate = finished > 0 ? c.completedJobs / finished : defaultRate
  const acceptanceRate =
    c.totalInvitations > 0 ? c.acceptedInvitations / c.totalInvitations : defaultRate
  return completion * completionRate + acceptance * acceptanceRate
}

/** Score in [0, 1] for the recommended sort. */
export function score(c: RankInput, radiusKm: number, budgetPaise?: number): number {
  const w = config.weights
  const distance = 1 - Math.min(c.distanceKm / radiusKm, 1)
  const rating = (bayesianRating(c.ratingSum, c.ratingCount) - 1) / 4
  const priceFit = budgetPaise
    ? clamp(1 - Math.max(0, c.pricePaise - budgetPaise) / budgetPaise, 0, 1)
    : 0.5
  const freshness = isNewWorker(c.completedJobs) ? 1 : 0
  return (
    w.distance * distance +
    w.rating * rating +
    w.reliability * reliabilityScore(c) +
    w.priceFit * priceFit +
    w.freshness * freshness
  )
}

/** FNV-1a: a cheap, stable hash for the daily tie-break. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Equal scores rotate daily but stay deterministic within a day. */
export function tieBreak(workerId: string, dateSeed: string): number {
  return fnv1a(`${workerId}|${dateSeed}`)
}

const EPSILON = 1e-9

/**
 * Orders candidates for a sort. Ties fall back to the recommended score, then the daily
 * tie-break, so every order is total and repeatable.
 */
export function rank<T extends RankInput>(
  candidates: readonly T[],
  options: { sort: SortKey; radiusKm: number; budgetPaise?: number; dateSeed: string },
): T[] {
  const keyed = candidates.map((c) => ({
    c,
    score: score(c, options.radiusKm, options.budgetPaise),
    bayes: bayesianRating(c.ratingSum, c.ratingCount),
    tie: tieBreak(c.workerId, options.dateSeed),
  }))
  type Keyed = (typeof keyed)[number]
  const primary: Record<SortKey, (a: Keyed, b: Keyed) => number> = {
    recommended: () => 0,
    price: (a, b) => a.c.pricePaise - b.c.pricePaise,
    rating: (a, b) => b.bayes - a.bayes,
    distance: (a, b) => a.c.distanceKm - b.c.distanceKm,
  }
  keyed.sort((a, b) => {
    const first = primary[options.sort](a, b)
    if (Math.abs(first) > EPSILON) return first
    if (Math.abs(b.score - a.score) > EPSILON) return b.score - a.score
    return a.tie - b.tie
  })
  return keyed.map((k) => k.c)
}

/** True when `a` is closer, cheaper and better rated than `b`. */
export function dominates(a: RankInput, b: RankInput): boolean {
  return (
    a.distanceKm < b.distanceKm &&
    a.pricePaise < b.pricePaise &&
    bayesianRating(a.ratingSum, a.ratingCount) > bayesianRating(b.ratingSum, b.ratingCount)
  )
}

/**
 * Fair exposure: the first page includes at least one new worker when any qualifies.
 * The best-ranked new worker below the page moves up to its last slot, but never above
 * a worker who is closer, cheaper and better rated.
 */
export function injectNewWorker<T extends RankInput>(
  ranked: readonly T[],
  pageSize: number = config.pageSize,
): T[] {
  if (ranked.length <= pageSize) return [...ranked]
  if (ranked.slice(0, pageSize).some((c) => isNewWorker(c.completedJobs))) return [...ranked]

  const slot = pageSize - 1
  for (let k = pageSize; k < ranked.length; k++) {
    const candidate = ranked[k]
    if (!isNewWorker(candidate.completedJobs)) continue
    const passedOver = ranked.slice(slot, k)
    if (passedOver.some((other) => dominates(other, candidate))) continue
    const result = [...ranked]
    result.splice(k, 1)
    result.splice(slot, 0, candidate)
    return result
  }
  return [...ranked]
}

export type ArrivalEstimate = {
  minMin: number
  maxMin: number
  /** Straight-line distance × road factor at city speed; never a promise. */
  basis: 'straight_line_estimate'
}

const round5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5)

/** Arrival range for an online worker, e.g. 2.3 km → 15–25 min. */
export function arrivalEstimate(distanceKm: number): ArrivalEstimate {
  const { roadFactor, speedKmh } = config.arrival
  const travel = ((distanceKm * roadFactor) / speedKmh) * 60
  const minMin = round5(travel + 5)
  const maxMin = Math.max(round5(travel * 1.5 + 10), minMin + 5)
  return { minMin, maxMin, basis: 'straight_line_estimate' }
}

/**
 * Tries each radius in turn and stops at the first with enough candidates, or at the
 * city cap. Returns the radius used alongside its candidates.
 */
export async function expandRadius<T>(
  find: (radiusKm: number) => Promise<T[]>,
  radii: readonly number[] = config.radiiKm,
  minCandidates: number = config.minCandidates,
): Promise<{ radiusKm: number; candidates: T[] }> {
  let last: { radiusKm: number; candidates: T[] } = { radiusKm: radii[0], candidates: [] }
  for (const radiusKm of radii) {
    last = { radiusKm, candidates: await find(radiusKm) }
    if (last.candidates.length >= minCandidates) break
  }
  return last
}
