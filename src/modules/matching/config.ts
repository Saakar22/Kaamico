/**
 * Tunable matching parameters (IMPLEMENTATION_PLAN.md §11.1). Changing these never
 * needs a schema change.
 */
export const matchingConfig = {
  /** Search radii tried in order; the last one is the city cap. */
  radiiKm: [3, 5, 8, 12],
  /** Stop expanding once a radius has at least this many candidates. */
  minCandidates: 5,
  pageSize: 10,
  weights: { distance: 0.35, rating: 0.25, reliability: 0.2, priceFit: 0.1, freshness: 0.1 },
  /** Bayesian prior: platform mean rating and how many reviews it is worth. */
  ratingPrior: { mean: 4.3, weight: 10 },
  reliability: { completion: 0.6, acceptance: 0.4, defaultRate: 0.8 },
  /** Workers with fewer completed jobs count as new (freshness boost, fair-exposure slot). */
  newWorkerJobs: 5,
  /** An online worker counts as available now only if active this recently. */
  onlineFreshMinutes: 15,
  /** Travel and wrap-up time added after every job when checking for clashes. */
  bufferMinutes: 30,
  arrival: { roadFactor: 1.4, speedKmh: 18, fastMaxMinutes: 30 },
  scheduling: { leadMinutes: 60, gridMinutes: 30, horizonDays: 7, maxAheadDays: 30 },
  /** Category price ranges use workers within this radius, and need this many to show. */
  nearbyPrices: { radiusKm: 10, minWorkers: 3 },
} as const
