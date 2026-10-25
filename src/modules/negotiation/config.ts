/** Negotiation rules (IMPLEMENTATION_PLAN.md §11.2). Tunable without schema changes. */
export const negotiationConfig = {
  /** Offers per thread in total, and per side. The last one is labelled "Final offer". */
  maxOffers: 6,
  maxOffersPerSide: 3,
  /** A customer may not offer less than this share of the listed price (or the minimum charge). */
  floorPercentOfListed: 40,
  /** Worker quotes above this share of their listed price need a reason. */
  noteRequiredAbovePercent: 150,
  offerTtl: {
    onDemandMinutes: 10,
    scheduledHours: 6,
    /** Scheduled offers also lapse this long before the job starts. */
    scheduledCutoffMinutes: 120,
  },
  requestTtl: {
    onDemandMinutes: 30,
    /** A scheduled request lapses this long before the requested start. */
    scheduledCutoffMinutes: 60,
  },
  /** After a rejection, the thread stays open this long for a new offer. */
  afterRejectMinutes: 10,
  limits: {
    openRequestsPerCustomer: 3,
    offers: { limit: 10, windowSeconds: 10 * 60 },
    messages: { limit: 20, windowSeconds: 10 * 60 },
  },
  /** Extra charges per booking, and the largest single charge (₹50,000). */
  maxChargesPerBooking: 5,
  maxChargePaise: 5_000_000,
  /** A customer cancelling after the professional set off pays a visit fee: min(₹99, minimum charge). */
  visitFeePaise: 9_900,
  /** A worker may cancel for a no-show this long after arriving. */
  noShowMinutes: 20,
  /** Scheduled jobs: the worker may set off at most this long before the start. */
  enRouteLeadMinutes: 90,
} as const
