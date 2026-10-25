import { describe, expect, it } from 'vitest'
import {
  arrivalEstimate,
  bayesianRating,
  dominates,
  expandRadius,
  injectNewWorker,
  rank,
  reliabilityScore,
  score,
  tieBreak,
  type RankInput,
} from './scoring'

let seq = 0
function cand(overrides: Partial<RankInput> = {}): RankInput {
  return {
    workerId: `w-${++seq}`,
    distanceKm: 2,
    pricePaise: 50000,
    ratingSum: 90,
    ratingCount: 20,
    completedJobs: 40,
    acceptedInvitations: 40,
    totalInvitations: 50,
    cancellationsByWorker: 1,
    ...overrides,
  }
}

const opts = { sort: 'recommended' as const, radiusKm: 5, dateSeed: '2026-10-25' }

describe('bayesianRating', () => {
  it('pulls few reviews towards the platform mean', () => {
    expect(bayesianRating(0, 0)).toBeCloseTo(4.3)
    // One 5-star review barely moves the needle; a hundred do.
    expect(bayesianRating(5, 1)).toBeCloseTo(4.364, 3)
    expect(bayesianRating(500, 100)).toBeGreaterThan(4.9)
  })
})

describe('reliabilityScore', () => {
  it('defaults to 0.8 for new workers', () => {
    expect(reliabilityScore(cand({ completedJobs: 2, totalInvitations: 10 }))).toBe(0.8)
  })

  it('blends completion and acceptance rates', () => {
    const c = cand({
      completedJobs: 9,
      cancellationsByWorker: 1,
      acceptedInvitations: 5,
      totalInvitations: 10,
    })
    expect(reliabilityScore(c)).toBeCloseTo(0.6 * 0.9 + 0.4 * 0.5)
  })
})

describe('score', () => {
  it('stays within [0, 1]', () => {
    const best = cand({ distanceKm: 0, ratingSum: 500, ratingCount: 100, completedJobs: 4 })
    const worst = cand({ distanceKm: 50, ratingSum: 100, ratingCount: 100, pricePaise: 1e7 })
    for (const c of [best, worst]) {
      const s = score(c, 5, 50000)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })

  it('rewards fitting the budget only when one is given', () => {
    const pricey = cand({ pricePaise: 80000 })
    const cheap = cand({ pricePaise: 40000 })
    expect(score(pricey, 5)).toBe(score(cheap, 5))
    expect(score(cheap, 5, 50000)).toBeGreaterThan(score(pricey, 5, 50000))
  })
})

describe('rank', () => {
  it('prefers closer workers when everything else is equal', () => {
    const far = cand({ distanceKm: 4 })
    const near = cand({ distanceKm: 1 })
    expect(rank([far, near], opts).map((c) => c.workerId)).toEqual([near.workerId, far.workerId])
  })

  it('prefers a well-rated worker over a slightly closer, poorly rated one', () => {
    const closePoor = cand({ distanceKm: 1.5, ratingSum: 250, ratingCount: 100 }) // 2.5 avg
    const greatFurther = cand({ distanceKm: 2, ratingSum: 490, ratingCount: 100 }) // 4.9 avg
    expect(rank([closePoor, greatFurther], opts)[0]).toBe(greatFurther)
  })

  it('sorts by price, rating and distance on request', () => {
    const a = cand({ pricePaise: 70000, distanceKm: 1, ratingSum: 400, ratingCount: 100 })
    const b = cand({ pricePaise: 40000, distanceKm: 3, ratingSum: 450, ratingCount: 100 })
    const c = cand({ pricePaise: 55000, distanceKm: 2, ratingSum: 480, ratingCount: 100 })
    const ids = (sort: 'price' | 'rating' | 'distance') =>
      rank([a, b, c], { ...opts, sort }).map((x) => x.workerId)
    expect(ids('price')).toEqual([b.workerId, c.workerId, a.workerId])
    expect(ids('rating')).toEqual([c.workerId, b.workerId, a.workerId])
    expect(ids('distance')).toEqual([a.workerId, c.workerId, b.workerId])
  })

  it('breaks exact ties deterministically per day, rotating across days', () => {
    const twins = Array.from({ length: 8 }, () => cand())
    const day1 = rank(twins, opts).map((c) => c.workerId)
    expect(rank([...twins].reverse(), opts).map((c) => c.workerId)).toEqual(day1)
    const day2 = rank(twins, { ...opts, dateSeed: '2026-10-26' }).map((c) => c.workerId)
    expect(day2).not.toEqual(day1)
    expect(tieBreak('w', 'a')).toBe(tieBreak('w', 'a'))
  })
})

describe('injectNewWorker', () => {
  const established = (n: number, overrides: Partial<RankInput> = {}) =>
    Array.from({ length: n }, (_, i) => cand({ distanceKm: 1 + i * 0.1, ...overrides }))

  it('moves the best new worker into the last slot of the first page', () => {
    const top = established(12)
    const newcomer = cand({ completedJobs: 0, ratingSum: 0, ratingCount: 0, distanceKm: 4 })
    const result = injectNewWorker([...top, newcomer], 10)
    expect(result).toHaveLength(13)
    expect(result[9]).toBe(newcomer)
    expect(result.slice(0, 9)).toEqual(top.slice(0, 9))
    expect(result[10]).toBe(top[9])
  })

  it('leaves the order alone when the first page already has a new worker', () => {
    const list = [...established(5), cand({ completedJobs: 1 }), ...established(6)]
    expect(injectNewWorker(list, 10)).toEqual(list)
  })

  it('never lifts a new worker above someone closer, cheaper and better rated', () => {
    // Everyone it would pass over dominates it, so it stays where it is.
    const top = established(11, { pricePaise: 30000, ratingSum: 480, ratingCount: 100 })
    const newcomer = cand({ completedJobs: 0, ratingSum: 0, ratingCount: 0, distanceKm: 6 })
    expect(dominates(top[9], newcomer)).toBe(true)
    expect(injectNewWorker([...top, newcomer], 10)).toEqual([...top, newcomer])
  })

  it('does nothing when every result fits on one page', () => {
    const list = established(4)
    expect(injectNewWorker(list, 10)).toEqual(list)
  })
})

describe('arrivalEstimate', () => {
  it('turns straight-line distance into a rounded range', () => {
    // 2.3 km × 1.4 / 18 km/h ≈ 10.7 min of travel.
    expect(arrivalEstimate(2.3)).toEqual({
      minMin: 15,
      maxMin: 25,
      basis: 'straight_line_estimate',
    })
    expect(arrivalEstimate(0)).toEqual({ minMin: 5, maxMin: 10, basis: 'straight_line_estimate' })
  })

  it('keeps the upper bound above the lower bound', () => {
    for (const km of [0.1, 1, 5, 12]) {
      const { minMin, maxMin } = arrivalEstimate(km)
      expect(maxMin).toBeGreaterThan(minMin)
      expect(minMin % 5).toBe(0)
    }
  })
})

describe('expandRadius', () => {
  it('stops at the first radius with enough candidates', async () => {
    const counts: Record<number, number> = { 3: 2, 5: 6, 8: 9, 12: 12 }
    const tried: number[] = []
    const result = await expandRadius(async (r) => {
      tried.push(r)
      return Array.from({ length: counts[r] }, (_, i) => i)
    })
    expect(tried).toEqual([3, 5])
    expect(result.radiusKm).toBe(5)
    expect(result.candidates).toHaveLength(6)
  })

  it('returns whatever the city cap finds when no radius has enough', async () => {
    const result = await expandRadius(async (r) => (r === 12 ? ['a'] : []))
    expect(result).toEqual({ radiusKm: 12, candidates: ['a'] })
  })
})
