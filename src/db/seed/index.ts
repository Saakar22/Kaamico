// Deterministic demo data. Replaces ALL data in DATABASE_URL.
//   npm run db:seed
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { sql as dsql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { DEV_AUTH_SECRET } from '../../config/dev-secret.ts'
import { hashPassword } from '../../modules/auth/password.ts'
import { deriveStartCode, hashStartCode } from '../../modules/bookings/start-code.ts'
import * as s from '../schema/index.ts'
import {
  CATEGORIES,
  CITIES,
  CUSTOMERS,
  REVIEW_COMMENTS,
  REVIEW_TAGS,
  WORKER_FIRST_NAMES,
  WORKER_LAST_NAMES,
  type ServiceSeed,
} from './data.ts'
import { createRandom } from './random.ts'

try {
  process.loadEnvFile('.env.local')
} catch {
  // CI provides variables directly.
}
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('Refusing to seed with NODE_ENV=production (pass --force if you really mean it).')
  process.exit(1)
}
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert']
type City = keyof typeof CITIES

const rnd = createRandom(20261025)
// Must match the running app (lib/secrets.ts) so start codes shown to customers verify.
const START_CODE_SECRET = process.env.AUTH_SECRET || DEV_AUTH_SECRET
const COMMISSION_BPS = Number(process.env.COMMISSION_BPS ?? 1000)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const IST_OFFSET = 330 * MINUTE
const NOW = new Date(Math.floor(Date.now() / MINUTE) * MINUTE)

// ---------- helpers ----------

const rupees = (r: number) => Math.round(r * 100)
const round10 = (r: number) => Math.max(10, Math.round(r / 10) * 10)
const at = (base: Date, offsetMs: number) => new Date(base.getTime() + offsetMs)
/** IST wall-clock time `days` from today. */
function istAt(days: number, hour: number, minute = 0): Date {
  const istMidnight = Math.floor((NOW.getTime() + IST_OFFSET) / DAY) * DAY - IST_OFFSET
  return new Date(istMidnight + days * DAY + (hour * 60 + minute) * MINUTE)
}
const range = (start: Date, end: Date) => `[${start.toISOString()},${end.toISOString()})`
const phone = (n: number) => `+9190000${String(n).padStart(5, '0')}`
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const jitter = (value: number, amount: number) => value + (rnd.next() - 0.5) * 2 * amount

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const usedCodes = new Set<string>()
function bookingCode(): string {
  for (;;) {
    let code = 'KMC-'
    for (let i = 0; i < 6; i++) code += rnd.pick([...CODE_ALPHABET])
    if (!usedCodes.has(code)) {
      usedCodes.add(code)
      return code
    }
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.sqrt(a))
}

let invoiceSeq = 0
function invoiceNumber(issued: Date): string {
  const ist = new Date(issued.getTime() + IST_OFFSET)
  const fyStart = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1
  invoiceSeq += 1
  return `KMC/${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}/${String(invoiceSeq).padStart(6, '0')}`
}

// ---------- row buffers ----------

const rows = {
  localities: [] as Insert<typeof s.localities>[],
  categories: [] as Insert<typeof s.serviceCategories>[],
  services: [] as Insert<typeof s.services>[],
  users: [] as Insert<typeof s.users>[],
  customerProfiles: [] as Insert<typeof s.customerProfiles>[],
  addresses: [] as Insert<typeof s.addresses>[],
  workers: [] as Insert<typeof s.workerProfiles>[],
  skills: [] as Insert<typeof s.workerSkills>[],
  pricing: [] as Insert<typeof s.workerServicePricing>[],
  availability: [] as Insert<typeof s.workerAvailabilityRules>[],
  timeOff: [] as Insert<typeof s.workerTimeOff>[],
  applications: [] as Insert<typeof s.verificationApplications>[],
  documents: [] as Insert<typeof s.verificationDocuments>[],
  bookings: [] as Insert<typeof s.bookings>[],
  invitations: [] as Insert<typeof s.bookingInvitations>[],
  offers: [] as Insert<typeof s.priceOffers>[],
  history: [] as Insert<typeof s.bookingStatusHistory>[],
  charges: [] as Insert<typeof s.bookingCharges>[],
  payments: [] as Insert<typeof s.payments>[],
  invoices: [] as Insert<typeof s.invoices>[],
  ledger: [] as Insert<typeof s.workerLedgerEntries>[],
  payouts: [] as Insert<typeof s.payouts>[],
  reviews: [] as Insert<typeof s.reviews>[],
  favorites: [] as Insert<typeof s.favorites>[],
  notifications: [] as Insert<typeof s.notifications>[],
  audit: [] as Insert<typeof s.adminAuditLogs>[],
}
/** Booking fields set after offers exist (bookings ↔ price_offers reference each other). */
const bookingFinal = new Map<string, Partial<Insert<typeof s.bookings>>>()

// ---------- catalog and places ----------

const localityIds = new Map<string, string>() // `${city}:${name}` → id
for (const [city, { localities }] of Object.entries(CITIES)) {
  for (const l of localities) {
    const id = randomUUID()
    localityIds.set(`${city}:${l.name}`, id)
    rows.localities.push({ id, city, name: l.name, pincode: l.pincode, lat: l.lat, lng: l.lng })
  }
}
const locality = (city: City, name: string) => {
  const l = CITIES[city].localities.find((x) => x.name === name)
  if (!l) throw new Error(`unknown locality ${city}:${name}`)
  return { ...l, id: localityIds.get(`${city}:${name}`)! }
}

type ServiceInfo = ServiceSeed & { id: string; categoryId: string; categorySlug: string }
const servicesBySlug = new Map<string, ServiceInfo>()
const categoryIds = new Map<string, string>()
CATEGORIES.forEach((c, i) => {
  const categoryId = randomUUID()
  categoryIds.set(c.slug, categoryId)
  rows.categories.push({
    id: categoryId,
    slug: c.slug,
    name: c.name,
    description: c.description,
    iconKey: c.icon,
    sortOrder: i,
  })
  for (const svc of c.services) {
    const id = randomUUID()
    servicesBySlug.set(svc.slug, { ...svc, id, categoryId, categorySlug: c.slug })
    rows.services.push({
      id,
      categoryId,
      slug: svc.slug,
      name: svc.name,
      description: svc.description,
      pricingUnit: svc.unit,
      typicalDurationMin: svc.durationMin,
      referenceMinPaise: rupees(svc.range[0]),
      referenceMaxPaise: rupees(svc.range[1]),
      searchTerms: `${c.terms} ${svc.terms ?? ''}`.trim(),
    })
  }
})

// ---------- admins ----------

// SEED_ADMIN_PASSWORD (e.g. in .env.local or CI) or a random one printed once at the end.
const adminPassword = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString('base64url')
const adminPasswordHash = await hashPassword(adminPassword)
const admins = [
  { name: 'Kaamico Admin', email: 'admin@kaamico.local' },
  { name: 'Ops Reviewer', email: 'ops@kaamico.local' },
].map((a) => {
  const id = randomUUID()
  rows.users.push({
    id,
    email: a.email,
    emailVerified: true,
    passwordHash: adminPasswordHash,
    name: a.name,
    roles: ['ADMIN'],
    createdAt: at(NOW, -200 * DAY),
  })
  return { id, ...a }
})
const adminId = admins[0].id

// ---------- customers ----------

type Customer = {
  userId: string
  name: string
  city: City
  addressId: string
  lat: number
  lng: number
  snapshot: s.AddressSnapshot
  localityLabel: string
}
const customers: Customer[] = CUSTOMERS.map((c, i) => {
  const userId = randomUUID()
  const loc = locality(c.city, c.locality)
  const addressId = randomUUID()
  const lat = jitter(loc.lat, 0.004)
  const lng = jitter(loc.lng, 0.004)
  const created = at(NOW, -rnd.int(90, 200) * DAY)
  rows.users.push({
    id: userId,
    phone: phone(i + 1),
    phoneVerifiedAt: created,
    name: c.name,
    roles: ['CUSTOMER'],
    createdAt: created,
    lastLoginAt: at(NOW, -rnd.int(1, 72) * HOUR),
  })
  const snapshot: s.AddressSnapshot = {
    line1: c.line1,
    locality: c.locality,
    city: c.city,
    state: CITIES[c.city].state,
    pincode: loc.pincode,
  }
  rows.addresses.push({
    id: addressId,
    userId,
    label: 'HOME',
    line1: c.line1,
    localityId: loc.id,
    city: c.city,
    state: CITIES[c.city].state,
    pincode: loc.pincode,
    lat,
    lng,
    isDefault: true,
    createdAt: created,
  })
  rows.customerProfiles.push({ userId, defaultAddressId: addressId, createdAt: created })
  return {
    userId,
    name: c.name,
    city: c.city,
    addressId,
    lat,
    lng,
    snapshot,
    localityLabel: `${c.locality}, ${c.city}`,
  }
})
const customerProfileStats = new Map(
  customers.map((c) => [c.userId, { bookings: 0, cancellations: 0 }]),
)

// A second, non-default address for the demo customer.
{
  const loc = locality('Pune', 'Shivajinagar')
  rows.addresses.push({
    id: randomUUID(),
    userId: customers[0].userId,
    label: 'WORK',
    line1: '4th floor, Sakhar Bhavan, FC Road',
    localityId: loc.id,
    city: 'Pune',
    state: 'Maharashtra',
    pincode: loc.pincode,
    lat: loc.lat,
    lng: loc.lng,
  })
}

// ---------- workers ----------

type Price = { serviceId: string; pricePaise: number; minChargePaise: number; negotiable: boolean }
type Worker = {
  id: string
  userId: string
  name: string
  city: City
  status: 'VERIFIED' | 'PENDING' | 'REJECTED' | 'UNVERIFIED'
  isNew: boolean
  lat: number
  lng: number
  categories: string[]
  prices: Map<string, Price>
  stats: {
    completed: number
    ratingSum: number
    ratingCount: number
    invitations: number
    accepted: number
  }
}

const AVAILABILITY_PATTERNS: { weekdays: number[]; windows: [number, number][] }[] = [
  { weekdays: [0, 1, 2, 3, 4, 5], windows: [[9 * 60, 19 * 60]] },
  {
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    windows: [
      [8 * 60, 14 * 60],
      [16 * 60, 20 * 60],
    ],
  },
  { weekdays: [0, 1, 2, 3, 4], windows: [[10 * 60, 18 * 60]] },
  { weekdays: [1, 2, 3, 4, 5, 6], windows: [[7 * 60, 13 * 60]] },
]
const BIO_TAILS = [
  'I bring my own tools and keep the work area clean.',
  'Punctual and careful with your home.',
  'Happy to explain the problem before starting work.',
  'Available for urgent jobs nearby.',
]
const LANGUAGES: Record<City, string[][]> = {
  Pune: [
    ['mr', 'hi'],
    ['mr', 'hi', 'en'],
    ['hi', 'en'],
  ],
  Bengaluru: [
    ['kn', 'hi'],
    ['kn', 'en'],
    ['ta', 'kn', 'en'],
    ['te', 'kn'],
  ],
}

const workers: Worker[] = []
const usedNames = new Set<string>()
// The first 40 workers hold the documented demo accounts and every verification state.
// The rest add verified supply (5 per category per city) so customers can compare.
const CORE_WORKERS = 40
const EXTRA_PER_CITY = 5 * CATEGORIES.length
for (let i = 0; i < CORE_WORKERS + 2 * EXTRA_PER_CITY; i++) {
  const extra = i >= CORE_WORKERS
  const k = i - CORE_WORKERS
  const city: City = extra
    ? k < EXTRA_PER_CITY
      ? 'Pune'
      : 'Bengaluru'
    : i < 20
      ? 'Pune'
      : 'Bengaluru'
  const j = i % 20
  const status: Worker['status'] = extra
    ? 'VERIFIED'
    : j === 4 || j === 5
      ? 'PENDING'
      : j === 6
        ? 'REJECTED'
        : j === 7
          ? 'UNVERIFIED'
          : 'VERIFIED'
  const isNew =
    status === 'VERIFIED' && (extra ? k % EXTRA_PER_CITY >= EXTRA_PER_CITY - 4 : j >= 17)
  const isDemo = i === 0

  let name = 'Rakesh Patil'
  if (!isDemo) {
    do name = `${rnd.pick(WORKER_FIRST_NAMES)} ${rnd.pick(WORKER_LAST_NAMES)}`
    while (usedNames.has(name))
  }
  usedNames.add(name)

  const primary = isDemo ? 'plumbing' : CATEGORIES[(extra ? k : j) % CATEGORIES.length].slug
  const categories = isDemo
    ? ['plumbing', 'electrical']
    : rnd.chance(0.4)
      ? [primary, rnd.pick(CATEGORIES.filter((c) => c.slug !== primary)).slug]
      : [primary]
  const loc = isDemo ? locality('Pune', 'Kothrud') : rnd.pick(CITIES[city].localities)
  const locId = localityIds.get(`${city}:${loc.name}`)!
  const lat = jitter(loc.lat, 0.008)
  const lng = jitter(loc.lng, 0.008)
  const years = isDemo ? 8 : rnd.int(1, 20)
  const userId = randomUUID()
  const id = randomUUID()
  const created = at(NOW, -(isNew ? rnd.int(3, 12) : rnd.int(40, 300)) * DAY)
  const online = status === 'VERIFIED' && (isDemo || rnd.chance(0.55))

  rows.users.push({
    id: userId,
    phone: phone(101 + i),
    phoneVerifiedAt: created,
    name,
    roles: ['WORKER'],
    createdAt: created,
    lastLoginAt: at(NOW, -rnd.int(1, 48) * HOUR),
  })
  const categoryNames = categories.map((slug) =>
    CATEGORIES.find((c) => c.slug === slug)!.name.toLowerCase(),
  )
  rows.workers.push({
    id,
    userId,
    displayName: name,
    bio: `${years} years of experience in ${categoryNames.join(' and ')}. ${rnd.pick(BIO_TAILS)}`,
    yearsExperience: years,
    languages: rnd.pick(LANGUAGES[city]),
    verificationStatus: status,
    isOnline: online,
    onlineSince: online ? at(NOW, -rnd.int(10, 240) * MINUTE) : null,
    baseLat: status === 'UNVERIFIED' ? null : lat,
    baseLng: status === 'UNVERIFIED' ? null : lng,
    baseLocalityId: status === 'UNVERIFIED' ? null : locId,
    serviceRadiusKm: isDemo ? 8 : rnd.pick(extra ? [8, 10, 12, 15] : [3, 5, 6, 8, 10]),
    lastActiveAt: online ? at(NOW, -rnd.int(0, 8) * MINUTE) : at(NOW, -rnd.int(3, 72) * HOUR),
    createdAt: created,
  })

  const worker: Worker = {
    id,
    userId,
    name,
    city,
    status,
    isNew,
    lat,
    lng,
    categories,
    prices: new Map(),
    stats: { completed: 0, ratingSum: 0, ratingCount: 0, invitations: 0, accepted: 0 },
  }
  workers.push(worker)

  for (const slug of categories) {
    rows.skills.push({
      workerId: id,
      categoryId: categoryIds.get(slug)!,
      yearsExperience: years,
      createdAt: created,
    })
  }

  // An unverified worker has not finished onboarding: no pricing or hours yet.
  if (status === 'UNVERIFIED') continue

  for (const slug of categories) {
    for (const svc of CATEGORIES.find((c) => c.slug === slug)!.services) {
      const info = servicesBySlug.get(svc.slug)!
      const mid = (svc.range[0] + svc.range[1]) / 2
      const price = Math.max(50, round10(mid * (0.85 + rnd.next() * 0.35)))
      const minCharge = Math.min(price, round10(Math.max(50, svc.range[0] * 0.8)))
      const p: Price = {
        serviceId: info.id,
        pricePaise: rupees(price),
        minChargePaise: rupees(minCharge),
        negotiable: isDemo || rnd.chance(0.85),
      }
      worker.prices.set(info.id, p)
      rows.pricing.push({
        workerId: id,
        serviceId: info.id,
        pricePaise: p.pricePaise,
        minChargePaise: p.minChargePaise,
        unit: svc.unit,
        isNegotiable: p.negotiable,
        createdAt: created,
      })
    }
  }

  const pattern = isDemo ? AVAILABILITY_PATTERNS[0] : rnd.pick(AVAILABILITY_PATTERNS)
  for (const weekday of pattern.weekdays) {
    for (const [startMinute, endMinute] of pattern.windows) {
      rows.availability.push({ workerId: id, weekday, startMinute, endMinute })
    }
  }
  if (status === 'VERIFIED' && rnd.chance(0.15)) {
    const start = istAt(rnd.int(5, 12), 0)
    rows.timeOff.push({
      workerId: id,
      period: range(start, at(start, rnd.int(1, 3) * DAY)),
      reason: 'Family function',
    })
  }
}

// ---------- verification ----------

for (const w of workers) {
  if (w.status === 'UNVERIFIED') continue
  const appId = randomUUID()
  const submitted = at(
    NOW,
    w.status === 'PENDING' ? -rnd.int(6, 60) * HOUR : -rnd.int(20, 90) * DAY,
  )
  const decided = w.status === 'VERIFIED' || w.status === 'REJECTED'
  const reviewedAt = decided ? at(submitted, rnd.int(4, 30) * HOUR) : null
  const reason =
    w.status === 'REJECTED'
      ? 'The selfie does not match the photo on the ID. Please upload a clear, well-lit selfie.'
      : null
  rows.applications.push({
    id: appId,
    workerId: w.id,
    status:
      w.status === 'VERIFIED' ? 'APPROVED' : w.status === 'REJECTED' ? 'REJECTED' : 'SUBMITTED',
    submittedAt: submitted,
    reviewerAdminId: decided ? adminId : null,
    reviewedAt,
    decisionReason: reason,
    createdAt: at(submitted, -2 * HOUR),
  })
  for (const docType of ['AADHAAR_MASKED', 'SELFIE'] as const) {
    const key = `seed/verification/${w.id}/${docType.toLowerCase()}.jpg`
    rows.documents.push({
      applicationId: appId,
      docType,
      idLast4: docType === 'AADHAAR_MASKED' ? String(rnd.int(1000, 9999)) : null,
      storageKey: key,
      mimeType: 'image/jpeg',
      sizeBytes: rnd.int(180_000, 900_000),
      sha256: sha256(key),
      uploadedAt: at(submitted, -HOUR),
      purgeAfter: reviewedAt ? at(reviewedAt, 90 * DAY) : null,
    })
  }
  if (decided) {
    rows.audit.push({
      adminUserId: adminId,
      action: 'DOCUMENT_VIEWED',
      entityType: 'verification_application',
      entityId: appId,
      createdAt: at(reviewedAt!, -10 * MINUTE),
    })
    rows.audit.push({
      adminUserId: adminId,
      action: w.status === 'VERIFIED' ? 'VERIFICATION_APPROVED' : 'VERIFICATION_REJECTED',
      entityType: 'verification_application',
      entityId: appId,
      before: { status: 'SUBMITTED' },
      after: { status: w.status === 'VERIFIED' ? 'APPROVED' : 'REJECTED' },
      reason,
      createdAt: reviewedAt!,
    })
  }
}

// ---------- bookings ----------

type Party = 'CUSTOMER' | 'WORKER'
type BookingPlan = {
  customer: Customer
  worker: Worker
  serviceSlug?: string
  start: Date
  timing: 'ON_DEMAND' | 'SCHEDULED'
  /** Offers in order; each counters the previous one. `accept` marks the final one accepted. */
  offers: { by: Party; factor: number }[]
  outcome:
    'COMPLETED' | 'CONFIRMED' | 'EN_ROUTE' | 'NEGOTIATING' | 'REQUESTED' | 'CANCELLED' | 'EXPIRED'
  description?: string
  /** Overrides when the request was made (for live showcase bookings). */
  createdAt?: Date
}

const ledgerBalance = new Map<string, number>()
function postLedger(entry: Insert<typeof s.workerLedgerEntries>) {
  rows.ledger.push(entry)
  ledgerBalance.set(entry.workerId, (ledgerBalance.get(entry.workerId) ?? 0) + entry.amountPaise)
}

function createBooking(plan: BookingPlan): string {
  const { customer, worker, start, timing, outcome } = plan
  const pickedServiceId = rnd.pick([...worker.prices.values()]).serviceId
  const svc =
    (plan.serviceSlug ? servicesBySlug.get(plan.serviceSlug) : undefined) ??
    [...servicesBySlug.values()].find((x) => x.id === pickedServiceId)!
  const price = worker.prices.get(svc.id)
  if (!price) throw new Error(`${worker.name} does not price ${svc.slug}`)

  const id = randomUUID()
  const invitationId = randomUUID()
  const created =
    plan.createdAt ??
    (timing === 'ON_DEMAND'
      ? at(start, -rnd.int(20, 40) * MINUTE)
      : at(start, -rnd.int(20, 60) * HOUR))
  const offerTtl = timing === 'ON_DEMAND' ? 10 * MINUTE : 6 * HOUR
  const listed = price.pricePaise
  const floor = Math.max(price.minChargePaise, Math.ceil(listed * 0.4))
  const distanceKm =
    Math.round(haversineKm(worker.lat, worker.lng, customer.lat, customer.lng) * 100) / 100

  const settles = outcome === 'COMPLETED' || outcome === 'CONFIRMED' || outcome === 'EN_ROUTE'
  rows.bookings.push({
    id,
    code: bookingCode(),
    customerId: customer.userId,
    serviceId: svc.id,
    categoryId: svc.categoryId,
    mode: 'DIRECT',
    timing,
    status: 'REQUESTED',
    requestedStart: start,
    addressId: customer.addressId,
    addressSnapshot: customer.snapshot,
    jobLat: customer.lat,
    jobLng: customer.lng,
    localityLabel: customer.localityLabel,
    description: plan.description ?? null,
    customerInitialOfferPaise: Math.max(
      floor,
      round10((listed * plan.offers[0].factor) / 100) * 100,
    ),
    listedPricePaise: listed,
    commissionBps: COMMISSION_BPS,
    idempotencyKey: randomUUID(),
    expiresAt: timing === 'ON_DEMAND' ? at(created, 30 * MINUTE) : at(start, -HOUR),
    createdAt: created,
  })
  rows.history.push({
    bookingId: id,
    toStatus: 'REQUESTED',
    actorUserId: customer.userId,
    actorRole: 'CUSTOMER',
    createdAt: created,
  })
  worker.stats.invitations += 1
  customerProfileStats.get(customer.userId)!.bookings += 1

  // Offers
  let t = created
  let parent: string | null = null
  let lastOfferId = ''
  let lastBy: Party = 'CUSTOMER'
  let lastAmount = 0
  plan.offers.forEach((o, idx) => {
    const offerId = randomUUID()
    const amount = Math.max(floor, round10((listed * o.factor) / 100) * 100)
    const isLast = idx === plan.offers.length - 1
    const pendingLast = isLast && (outcome === 'NEGOTIATING' || outcome === 'REQUESTED')
    const expiredLast = isLast && outcome === 'EXPIRED'
    rows.offers.push({
      id: offerId,
      bookingId: id,
      invitationId,
      workerId: worker.id,
      offeredBy: o.by,
      amountPaise: amount,
      status: isLast
        ? pendingLast
          ? 'PENDING'
          : expiredLast
            ? 'EXPIRED'
            : settles
              ? 'ACCEPTED'
              : 'WITHDRAWN'
        : 'COUNTERED',
      parentOfferId: parent,
      round: idx + 1,
      // Pending offers in the demo stay open for a few hours from now.
      expiresAt: pendingLast ? at(NOW, 5 * HOUR) : at(t, offerTtl),
      respondedAt: pendingLast ? null : at(t, rnd.int(2, 8) * MINUTE),
      respondedByUserId:
        pendingLast || expiredLast ? null : o.by === 'CUSTOMER' ? worker.userId : customer.userId,
      createdAt: t,
    })
    if (idx === 1)
      rows.history.push({
        bookingId: id,
        fromStatus: 'REQUESTED',
        toStatus: 'NEGOTIATING',
        actorUserId: o.by === 'WORKER' ? worker.userId : customer.userId,
        actorRole: o.by,
        createdAt: t,
      })
    parent = offerId
    lastOfferId = offerId
    lastBy = o.by
    lastAmount = amount
    t = at(t, rnd.int(2, 8) * MINUTE)
  })

  const invitationStatus =
    outcome === 'REQUESTED'
      ? 'INVITED'
      : outcome === 'NEGOTIATING'
        ? 'QUOTED'
        : outcome === 'EXPIRED'
          ? 'EXPIRED'
          : settles
            ? 'WON'
            : 'SEEN'
  rows.invitations.push({
    id: invitationId,
    bookingId: id,
    workerId: worker.id,
    status: invitationStatus,
    distanceKm,
    expiresAt: timing === 'ON_DEMAND' ? at(created, 30 * MINUTE) : at(start, -HOUR),
    seenAt: outcome === 'REQUESTED' ? null : at(created, 2 * MINUTE),
    respondedAt: settles || outcome === 'NEGOTIATING' ? at(created, 3 * MINUTE) : null,
    createdAt: created,
  })

  const prevStatus = plan.offers.length > 1 ? 'NEGOTIATING' : 'REQUESTED'
  if (outcome === 'REQUESTED' || outcome === 'NEGOTIATING') {
    bookingFinal.set(id, { status: outcome })
    return id
  }
  if (outcome === 'EXPIRED') {
    rows.history.push({
      bookingId: id,
      fromStatus: prevStatus,
      toStatus: 'EXPIRED',
      actorRole: 'SYSTEM',
      reason: 'No response before the request expired',
      createdAt: at(start, -HOUR),
    })
    bookingFinal.set(id, { status: 'EXPIRED' })
    return id
  }
  if (outcome === 'CANCELLED') {
    const cancelledAt = at(t, rnd.int(5, 60) * MINUTE)
    rows.history.push({
      bookingId: id,
      fromStatus: prevStatus,
      toStatus: 'CANCELLED',
      actorUserId: customer.userId,
      actorRole: 'CUSTOMER',
      reason: 'Fixed it myself',
      createdAt: cancelledAt,
    })
    bookingFinal.set(id, {
      status: 'CANCELLED',
      cancelledAt,
      cancelledBy: 'CUSTOMER',
      cancellationReason: 'Fixed it myself',
    })
    customerProfileStats.get(customer.userId)!.cancellations += 1
    return id
  }

  // Confirmed (and beyond): the accepting party is the one who did NOT make the last offer.
  worker.stats.accepted += 1
  const acceptor: Party = lastBy === 'CUSTOMER' ? 'WORKER' : 'CUSTOMER'
  const confirmedAt = t
  const slotEnd = at(start, (svc.durationMin + 30) * MINUTE)
  rows.history.push({
    bookingId: id,
    fromStatus: prevStatus,
    toStatus: 'CONFIRMED',
    actorUserId: acceptor === 'WORKER' ? worker.userId : customer.userId,
    actorRole: acceptor,
    createdAt: confirmedAt,
  })
  const final: Partial<Insert<typeof s.bookings>> = {
    status: outcome,
    workerId: worker.id,
    agreedPricePaise: lastAmount,
    acceptedOfferId: lastOfferId,
    slot: range(start, slotEnd),
    confirmedAt,
    // The same derivation the app uses, so demo customers see a working start code.
    startCodeHash: hashStartCode(id, deriveStartCode(id, START_CODE_SECRET)),
    expiresAt: null,
  }
  bookingFinal.set(id, final)
  if (outcome === 'CONFIRMED') return id

  // Travel starts after confirmation, usually 15–30 minutes before the slot.
  const enRoute = new Date(
    Math.max(confirmedAt.getTime() + 2 * MINUTE, start.getTime() - rnd.int(15, 30) * MINUTE),
  )
  rows.history.push({
    bookingId: id,
    fromStatus: 'CONFIRMED',
    toStatus: 'EN_ROUTE',
    actorUserId: worker.userId,
    actorRole: 'WORKER',
    createdAt: enRoute,
  })
  if (outcome === 'EN_ROUTE') return id

  const arrived = at(start, rnd.int(-5, 10) * MINUTE)
  const started = at(arrived, rnd.int(3, 10) * MINUTE)
  const completed = at(started, (svc.durationMin + rnd.int(-10, 30)) * MINUTE)
  rows.history.push(
    {
      bookingId: id,
      fromStatus: 'EN_ROUTE',
      toStatus: 'ARRIVED',
      actorUserId: worker.userId,
      actorRole: 'WORKER',
      createdAt: arrived,
    },
    {
      bookingId: id,
      fromStatus: 'ARRIVED',
      toStatus: 'IN_PROGRESS',
      actorUserId: worker.userId,
      actorRole: 'WORKER',
      createdAt: started,
    },
    {
      bookingId: id,
      fromStatus: 'IN_PROGRESS',
      toStatus: 'COMPLETED',
      actorUserId: worker.userId,
      actorRole: 'WORKER',
      createdAt: completed,
    },
  )

  let charges = 0
  if (rnd.chance(0.15)) {
    charges = rupees(round10(rnd.int(80, 400)))
    rows.charges.push({
      bookingId: id,
      proposedByWorkerId: worker.id,
      kind: 'MATERIALS',
      description: 'Replacement part',
      amountPaise: charges,
      status: 'APPROVED',
      decidedAt: at(started, 20 * MINUTE),
      decidedByUserId: customer.userId,
      createdAt: at(started, 15 * MINUTE),
    })
  }
  Object.assign(final, {
    approvedChargesPaise: charges,
    startedAt: started,
    completedAt: completed,
  })

  const total = lastAmount + charges
  const commission = Math.round((total * COMMISSION_BPS) / 10_000)
  const cash = rnd.chance(0.6)
  const capturedAt = at(completed, 5 * MINUTE)
  rows.payments.push({
    bookingId: id,
    payerUserId: customer.userId,
    provider: cash ? 'CASH' : 'SIMULATED',
    amountPaise: total,
    status: 'CAPTURED',
    idempotencyKey: randomUUID(),
    capturedAt,
    createdAt: completed,
  })
  rows.invoices.push({
    bookingId: id,
    number: invoiceNumber(capturedAt),
    lineItems: [
      { label: `${svc.name} (agreed price)`, amountPaise: lastAmount },
      ...(charges ? [{ label: 'Approved extra: replacement part', amountPaise: charges }] : []),
    ],
    subtotalPaise: total,
    platformFeePaise: commission,
    totalPaise: total,
    issuedAt: capturedAt,
  })
  postLedger({
    workerId: worker.id,
    bookingId: id,
    type: 'JOB_EARNING',
    amountPaise: total,
    description: `${svc.name}`,
    createdAt: capturedAt,
  })
  postLedger({
    workerId: worker.id,
    bookingId: id,
    type: 'COMMISSION',
    amountPaise: -commission,
    description: `Platform fee ${COMMISSION_BPS / 100}%`,
    createdAt: capturedAt,
  })
  if (cash)
    postLedger({
      workerId: worker.id,
      bookingId: id,
      type: 'CASH_COLLECTED',
      amountPaise: -total,
      description: 'Collected in cash',
      createdAt: capturedAt,
    })

  worker.stats.completed += 1
  if (rnd.chance(0.8)) {
    const roll = rnd.next()
    const rating = roll < 0.55 ? 5 : roll < 0.85 ? 4 : roll < 0.95 ? 3 : 2
    worker.stats.ratingSum += rating
    worker.stats.ratingCount += 1
    rows.reviews.push({
      bookingId: id,
      customerId: customer.userId,
      workerId: worker.id,
      rating,
      tags: rating >= 4 ? rnd.shuffle(REVIEW_TAGS).slice(0, rnd.int(1, 3)) : [],
      comment: rnd.chance(0.8) ? rnd.pick(REVIEW_COMMENTS[rating]) : null,
      createdAt: at(completed, rnd.int(1, 72) * HOUR),
    })
  }
  return id
}

// Completed history: experienced verified workers, customers in the same city.
for (const w of workers.filter((x) => x.status === 'VERIFIED' && !x.isNew)) {
  const cityCustomers = customers.filter((c) => c.city === w.city)
  const count = w === workers[0] ? 9 : rnd.int(2, 6)
  for (let k = 0; k < count; k++) {
    const roll = rnd.next()
    const offers: BookingPlan['offers'] =
      roll < 0.45
        ? [{ by: 'CUSTOMER', factor: 1 }]
        : roll < 0.8
          ? [
              { by: 'CUSTOMER', factor: 0.85 + rnd.next() * 0.08 },
              { by: 'WORKER', factor: 0.95 },
            ]
          : [{ by: 'CUSTOMER', factor: 0.9 }]
    createBooking({
      customer: rnd.pick(cityCustomers),
      worker: w,
      start: istAt(-rnd.int(3, 75), rnd.int(9, 16), rnd.pick([0, 30])),
      timing: rnd.chance(0.35) ? 'ON_DEMAND' : 'SCHEDULED',
      offers,
      outcome: 'COMPLETED',
    })
  }
}

// Showcase bookings for the demo accounts (see README → Demo accounts).
const [priya, aditya, neha, rahul] = customers
const rakesh = workers[0]
const findWorker = (city: City, category: string) =>
  workers.find(
    (w) =>
      w !== rakesh &&
      w.city === city &&
      w.status === 'VERIFIED' &&
      !w.isNew &&
      w.categories.includes(category),
  )!

const demoRequestId = createBooking({
  customer: priya,
  worker: rakesh,
  serviceSlug: 'tap-repair',
  start: istAt(1, 11),
  timing: 'SCHEDULED',
  offers: [{ by: 'CUSTOMER', factor: 1 }],
  outcome: 'REQUESTED',
  description: 'Kitchen tap has been dripping for two days.',
})
const demoNegotiationId = createBooking({
  customer: aditya,
  worker: rakesh,
  serviceSlug: 'fan-installation',
  start: istAt(2, 15),
  timing: 'SCHEDULED',
  offers: [
    { by: 'CUSTOMER', factor: 0.8 },
    { by: 'WORKER', factor: 0.92 },
  ],
  outcome: 'NEGOTIATING',
  description: 'Replace the bedroom ceiling fan. I have the new fan.',
})
const demoConfirmedId = createBooking({
  customer: priya,
  worker: findWorker('Pune', 'cleaning'),
  serviceSlug: 'bathroom-cleaning',
  start: istAt(1, 16),
  timing: 'SCHEDULED',
  offers: [
    { by: 'CUSTOMER', factor: 0.9 },
    { by: 'WORKER', factor: 0.96 },
  ],
  outcome: 'CONFIRMED',
})
createBooking({
  customer: neha,
  worker: findWorker('Pune', 'electrical'),
  start: at(NOW, 15 * MINUTE),
  createdAt: at(NOW, -25 * MINUTE),
  timing: 'ON_DEMAND',
  offers: [{ by: 'CUSTOMER', factor: 1 }],
  outcome: 'EN_ROUTE',
})
createBooking({
  customer: priya,
  worker: findWorker('Pune', 'carpentry'),
  start: istAt(-6, 12),
  timing: 'SCHEDULED',
  offers: [{ by: 'CUSTOMER', factor: 0.9 }],
  outcome: 'CANCELLED',
})
createBooking({
  customer: priya,
  worker: findWorker('Pune', 'painting'),
  start: istAt(-12, 10),
  timing: 'SCHEDULED',
  offers: [{ by: 'CUSTOMER', factor: 0.8 }],
  outcome: 'EXPIRED',
})
createBooking({
  customer: rahul,
  worker: findWorker('Bengaluru', 'appliance-repair'),
  start: istAt(1, 10),
  timing: 'SCHEDULED',
  offers: [{ by: 'CUSTOMER', factor: 1 }],
  outcome: 'CONFIRMED',
})

// A simulated payout for the demo worker if the platform owes them money.
{
  const balance = ledgerBalance.get(rakesh.id) ?? 0
  if (balance > rupees(1000)) {
    const payoutId = randomUUID()
    const amount = Math.floor((balance * 0.6) / 100) * 100
    const paidAt = at(NOW, -3 * DAY)
    rows.payouts.push({
      id: payoutId,
      workerId: rakesh.id,
      amountPaise: amount,
      status: 'PAID',
      mode: 'SIMULATED',
      reference: 'SIM-PAYOUT-0001',
      requestedAt: at(paidAt, -DAY),
      paidAt,
    })
    postLedger({
      workerId: rakesh.id,
      payoutId,
      type: 'PAYOUT',
      amountPaise: -amount,
      description: 'Payout (simulated)',
      createdAt: paidAt,
    })
  }
}

rows.favorites.push({ customerId: priya.userId, workerId: rakesh.id })

const pendingWorker = workers[4]
rows.notifications.push(
  {
    userId: rakesh.userId,
    type: 'booking.requested',
    title: 'New request from Priya',
    body: 'Tap repair · tomorrow 11:00 am',
    link: `/worker/requests`,
    createdAt: at(NOW, -30 * MINUTE),
  },
  {
    userId: aditya.userId,
    type: 'offer.received',
    title: 'Rakesh sent a counteroffer',
    body: 'Fan installation',
    link: `/bookings/${demoNegotiationId}/negotiate`,
    createdAt: at(NOW, -2 * HOUR),
  },
  {
    userId: priya.userId,
    type: 'booking.confirmed',
    title: 'Booking confirmed',
    body: 'Bathroom cleaning · tomorrow 4:00 pm',
    link: `/bookings/${demoConfirmedId}`,
    createdAt: at(NOW, -5 * HOUR),
    readAt: at(NOW, -4 * HOUR),
  },
  {
    userId: pendingWorker.userId,
    type: 'verification.submitted',
    title: 'Verification submitted',
    body: 'We usually review applications within 24 hours.',
    link: '/worker/verification',
    createdAt: at(NOW, -6 * HOUR),
  },
)

// Worker aggregates follow from the generated history.
for (const w of workers) {
  const row = rows.workers.find((r) => r.id === w.id)!
  Object.assign(row, {
    completedJobs: w.stats.completed,
    ratingSum: w.stats.ratingSum,
    ratingCount: w.stats.ratingCount,
    totalInvitations: w.stats.invitations,
    acceptedInvitations: w.stats.accepted,
  })
}
for (const p of rows.customerProfiles) {
  const stats = customerProfileStats.get(p.userId)!
  p.bookingsCount = stats.bookings
  p.cancellationsCount = stats.cancellations
}

// ---------- write ----------

const client = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })
const db = drizzle({ client, schema: s, casing: 'snake_case' })

type Executor = Pick<typeof db, 'insert'>
async function insertAll<T extends Parameters<typeof db.insert>[0]>(
  ex: Executor,
  table: T,
  values: Insert<T>[],
) {
  for (let i = 0; i < values.length; i += 500) {
    await ex.insert(table).values(values.slice(i, i + 500) as never)
  }
}

try {
  await db.transaction(async (tx) => {
    const tables = await tx.execute<{ tablename: string }>(
      dsql`select tablename from pg_tables where schemaname = 'public'`,
    )
    await tx.execute(
      dsql.raw(
        `truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} restart identity cascade`,
      ),
    )
  })

  await db.transaction(async (tx) => {
    await insertAll(tx, s.localities, rows.localities)
    await insertAll(tx, s.serviceCategories, rows.categories)
    await insertAll(tx, s.services, rows.services)
    await insertAll(tx, s.users, rows.users)
    await insertAll(tx, s.addresses, rows.addresses)
    await insertAll(tx, s.customerProfiles, rows.customerProfiles)
    await insertAll(tx, s.workerProfiles, rows.workers)
    await insertAll(tx, s.workerSkills, rows.skills)
    await insertAll(tx, s.workerServicePricing, rows.pricing)
    await insertAll(tx, s.workerAvailabilityRules, rows.availability)
    await insertAll(tx, s.workerTimeOff, rows.timeOff)
    await insertAll(tx, s.verificationApplications, rows.applications)
    await insertAll(tx, s.verificationDocuments, rows.documents)
    await insertAll(tx, s.bookings, rows.bookings)
    await insertAll(tx, s.bookingInvitations, rows.invitations)
    await insertAll(tx, s.priceOffers, rows.offers)
    for (const [id, values] of bookingFinal) {
      await tx
        .update(s.bookings)
        .set(values)
        .where(dsql`${s.bookings.id} = ${id}`)
    }
    await insertAll(tx, s.bookingStatusHistory, rows.history)
    await insertAll(tx, s.bookingCharges, rows.charges)
    await insertAll(tx, s.payments, rows.payments)
    await insertAll(tx, s.invoices, rows.invoices)
    await insertAll(tx, s.payouts, rows.payouts)
    await insertAll(tx, s.workerLedgerEntries, rows.ledger)
    await insertAll(tx, s.reviews, rows.reviews)
    await insertAll(tx, s.favorites, rows.favorites)
    await insertAll(tx, s.notifications, rows.notifications)
    await insertAll(tx, s.adminAuditLogs, rows.audit)
  })

  const statuses = new Map<string, number>()
  for (const v of bookingFinal.values()) statuses.set(v.status!, (statuses.get(v.status!) ?? 0) + 1)
  console.log(
    `Seeded ${rows.localities.length} localities, ${rows.services.length} services in ${rows.categories.length} categories, ` +
      `${customers.length} customers, ${workers.length} workers, ${admins.length} admins, ` +
      `${rows.bookings.length} bookings (${[...statuses].map(([k, v]) => `${v} ${k}`).join(', ')}), ` +
      `${rows.reviews.length} reviews.`,
  )
  console.log(
    `Demo: customer ${phone(1)} · worker ${phone(101)} (Rakesh) · pending worker ${phone(105)} · admin admin@kaamico.local`,
  )
  console.log(
    process.env.SEED_ADMIN_PASSWORD
      ? 'Admin password: the value of SEED_ADMIN_PASSWORD.'
      : `Admin password (random, shown once): ${adminPassword}`,
  )
  console.log(
    `Demo request ${demoRequestId} is waiting for Rakesh; negotiation ${demoNegotiationId} is waiting for Aditya.`,
  )
} catch (error) {
  console.error('Seed failed:', error)
  process.exitCode = 1
} finally {
  await client.end()
}
