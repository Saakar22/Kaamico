import 'server-only'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import {
  bookingCharges,
  bookingInvitations,
  bookingStatusHistory,
  negotiationMessages,
  priceOffers,
  type AddressSnapshot,
} from '@/db/schema'
import { notFound } from '@/lib/errors'
import { authSecret } from '@/lib/secrets'
import type { Actor } from '@/modules/auth/types'
import type { PricingUnit } from '@/modules/catalog/units'
import { negotiationConfig } from '@/modules/negotiation/config'
import { customerFloor, isFinalOffer, type Party } from '@/modules/negotiation/rules'
import { photoUrl } from '@/modules/uploads/serve'
import { expireDue } from './repo'
import { deriveStartCode } from './start-code'
import { ACTIVE_JOB, OPEN_REQUEST, type BookingStatus } from './state-machine'

export type OfferView = {
  id: string
  offeredBy: Party
  amountPaise: number
  note: string | null
  status: string
  round: number
  isFinal: boolean
  expiresAt: string
  createdAt: string
}

export type MessageView = {
  id: string
  fromMe: boolean
  body: string
  redacted: boolean
  createdAt: string
}
export type ChargeView = {
  id: string
  kind: string
  description: string
  amountPaise: number
  status: string
  createdAt: string
}
export type HistoryView = {
  from: string | null
  to: string
  actor: string
  reason: string | null
  at: string
}

/** What a participant needs to act on the thread, computed on the server. */
export type NegotiationState = {
  party: Party
  pendingFromMe: OfferView | null
  pendingFromThem: OfferView | null
  canOffer: boolean
  offersLeft: number
  /** Bounds for the next offer (customer: floor..listed; worker: up to their last ask). */
  minPaise: number | null
  maxPaise: number | null
  negotiable: boolean
}

type BaseRow = {
  id: string
  code: string
  status: BookingStatus
  version: number
  timing: 'ON_DEMAND' | 'SCHEDULED'
  requested_start: Date | string
  slot_start: Date | string | null
  slot_end: Date | string | null
  expires_at: Date | string | null
  customer_id: string
  customer_name: string | null
  worker_id: string | null
  invited_worker_id: string
  invitation_id: string
  invitation_status: string
  distance_km: number | string
  worker_name: string
  worker_photo: string | null
  worker_rating_sum: number
  worker_rating_count: number
  service_id: string
  service_name: string
  pricing_unit: PricingUnit
  description: string | null
  locality_label: string
  address_snapshot: AddressSnapshot
  listed_price_paise: number | null
  agreed_price_paise: number | null
  approved_charges_paise: number
  final_amount_paise: number | null
  min_charge_paise: number | null
  is_negotiable: boolean | null
  start_code_attempts: number
  cancellation_reason: string | null
  completed_at: Date | string | null
  job_lat: number
  job_lng: number
  commission_bps: number
}

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)

async function loadBase(where: ReturnType<typeof sql>): Promise<BaseRow | undefined> {
  const [row] = await getDb().execute<BaseRow>(sql`
    select b.id, b.code, b.status, b.version, b.timing, b.requested_start,
           lower(b.slot) as slot_start, upper(b.slot) as slot_end, b.expires_at,
           b.customer_id, cu.name as customer_name, b.worker_id,
           i.worker_id as invited_worker_id, i.id as invitation_id, i.status as invitation_status, i.distance_km,
           w.display_name as worker_name, w.photo_key as worker_photo,
           w.rating_sum as worker_rating_sum, w.rating_count as worker_rating_count,
           b.service_id, s.name as service_name, s.pricing_unit, b.description, b.locality_label,
           b.address_snapshot, b.listed_price_paise, b.agreed_price_paise, b.approved_charges_paise,
           b.final_amount_paise, p.min_charge_paise, p.is_negotiable, b.start_code_attempts,
           b.cancellation_reason, b.completed_at, b.job_lat, b.job_lng, b.commission_bps
    from bookings b
    join booking_invitations i on i.booking_id = b.id
    join worker_profiles w on w.id = i.worker_id
    join users cu on cu.id = b.customer_id
    join services s on s.id = b.service_id
    left join worker_service_pricing p on p.worker_id = i.worker_id and p.service_id = b.service_id
    where ${where}
    order by (i.worker_id = b.worker_id) desc nulls last
    limit 1`)
  return row
}

async function threadParts(row: BaseRow, viewer: { userId: string; party: Party }) {
  const db = getDb()
  const [offers, messages, charges, history] = await Promise.all([
    db
      .select()
      .from(priceOffers)
      .where(
        and(eq(priceOffers.bookingId, row.id), eq(priceOffers.workerId, row.invited_worker_id)),
      )
      .orderBy(asc(priceOffers.round)),
    db
      .select()
      .from(negotiationMessages)
      .where(
        and(
          eq(negotiationMessages.bookingId, row.id),
          eq(negotiationMessages.workerId, row.invited_worker_id),
        ),
      )
      .orderBy(asc(negotiationMessages.createdAt)),
    db
      .select()
      .from(bookingCharges)
      .where(eq(bookingCharges.bookingId, row.id))
      .orderBy(asc(bookingCharges.createdAt)),
    db
      .select()
      .from(bookingStatusHistory)
      .where(eq(bookingStatusHistory.bookingId, row.id))
      .orderBy(asc(bookingStatusHistory.createdAt), asc(bookingStatusHistory.id)),
  ])

  const offerViews: OfferView[] = offers.map((o, i) => ({
    id: o.id,
    offeredBy: o.offeredBy,
    amountPaise: o.amountPaise,
    note: o.note,
    status: o.status,
    round: o.round,
    isFinal: isFinalOffer(offers.slice(0, i), o.offeredBy),
    expiresAt: o.expiresAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
  }))

  const party = viewer.party
  const open = OPEN_REQUEST.includes(row.status)
  const mine = offerViews.filter((o) => o.offeredBy === party)
  const pendingFromMe =
    offerViews.find((o) => o.offeredBy === party && o.status === 'PENDING') ?? null
  const pendingFromThem =
    offerViews.find((o) => o.offeredBy !== party && o.status === 'PENDING') ?? null
  const offersLeft = Math.max(
    0,
    Math.min(
      negotiationConfig.maxOffersPerSide - mine.length,
      negotiationConfig.maxOffers - offerViews.length,
    ),
  )
  const listed = row.listed_price_paise ?? 0
  const terms = {
    listedPricePaise: listed,
    minChargePaise: row.min_charge_paise ?? 0,
    negotiable: row.is_negotiable ?? true,
  }
  const negotiation: NegotiationState = {
    party,
    pendingFromMe,
    pendingFromThem,
    canOffer:
      open &&
      !pendingFromMe &&
      offersLeft > 0 &&
      !['DECLINED', 'EXPIRED', 'LOST'].includes(row.invitation_status),
    offersLeft,
    minPaise:
      party === 'CUSTOMER'
        ? Math.max(customerFloor(terms), ...mine.map((o) => o.amountPaise))
        : null,
    maxPaise:
      party === 'CUSTOMER'
        ? listed
        : mine.length
          ? Math.min(...mine.map((o) => o.amountPaise))
          : null,
    negotiable: terms.negotiable,
  }

  return {
    offers: offerViews,
    negotiation,
    messages: messages.map<MessageView>((m) => ({
      id: m.id,
      fromMe: m.senderUserId === viewer.userId,
      body: m.body,
      redacted: m.redacted,
      createdAt: m.createdAt.toISOString(),
    })),
    charges: charges.map<ChargeView>((c) => ({
      id: c.id,
      kind: c.kind,
      description: c.description,
      amountPaise: c.amountPaise,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
    history: history.map<HistoryView>((h) => ({
      from: h.fromStatus,
      to: h.toStatus,
      actor: h.actorRole,
      reason: h.reason,
      at: h.createdAt.toISOString(),
    })),
  }
}

function commonFields(row: BaseRow) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    version: row.version,
    timing: row.timing,
    requestedStart: iso(row.requested_start)!,
    slot: row.slot_start ? { start: iso(row.slot_start)!, end: iso(row.slot_end)! } : null,
    expiresAt: iso(row.expires_at),
    service: { id: row.service_id, name: row.service_name, unit: row.pricing_unit },
    description: row.description,
    localityLabel: row.locality_label,
    price: {
      listedPaise: row.listed_price_paise,
      agreedPaise: row.agreed_price_paise,
      approvedChargesPaise: row.approved_charges_paise,
      totalPaise: row.final_amount_paise,
    },
    cancellationReason: row.cancellation_reason,
    completedAt: iso(row.completed_at),
  }
}

/** The customer's view of their own booking (others get 404). The start code is shown only to them. */
export async function getCustomerBooking(actor: Actor, bookingId: string, now: Date = new Date()) {
  if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found')
  await expireDue(now, bookingId)
  const row = await loadBase(sql`b.id = ${bookingId} and b.customer_id = ${actor.userId}`)
  if (!row) throw notFound('Booking not found')
  const parts = await threadParts(row, { userId: actor.userId, party: 'CUSTOMER' })
  return {
    ...commonFields(row),
    worker: {
      id: row.invited_worker_id,
      displayName: row.worker_name,
      photoUrl: photoUrl(row.invited_worker_id, row.worker_photo),
      rating: {
        avg:
          row.worker_rating_count > 0
            ? Math.round((row.worker_rating_sum / row.worker_rating_count) * 10) / 10
            : null,
        count: row.worker_rating_count,
      },
    },
    address: row.address_snapshot,
    startCode:
      ACTIVE_JOB.includes(row.status) && row.status !== 'IN_PROGRESS'
        ? deriveStartCode(row.id, authSecret())
        : null,
    ...parts,
  }
}

export type CustomerBookingView = Awaited<ReturnType<typeof getCustomerBooking>>

const ADDRESS_VISIBLE_AFTER_COMPLETION_MS = 24 * 60 * 60_000

/** What the invited (or assigned) professional may see of a booking. */
async function workerProjection(row: BaseRow, actor: Actor, now: Date) {
  const parts = await threadParts(row, { userId: actor.userId, party: 'WORKER' })
  const assigned = row.worker_id === actor.workerId
  const completedAt = row.completed_at ? new Date(row.completed_at).getTime() : null
  const showAddress =
    assigned &&
    (ACTIVE_JOB.includes(row.status) ||
      (row.status === 'COMPLETED' &&
        completedAt !== null &&
        now.getTime() - completedAt < ADDRESS_VISIBLE_AFTER_COMPLETION_MS))
  return {
    ...commonFields(row),
    invitationId: row.invitation_id,
    invitationStatus: row.invitation_status,
    customerFirstName: (row.customer_name ?? 'Customer').trim().split(/\s+/)[0],
    distanceKm: Math.round(Number(row.distance_km) * 10) / 10,
    assigned,
    address: showAddress ? row.address_snapshot : null,
    /** For a map link; only alongside the address. */
    location: showAddress ? { lat: row.job_lat, lng: row.job_lng } : null,
    startCodeAttemptsLeft: Math.max(0, 5 - row.start_code_attempts),
    /** Kaamico's fee rate on this job (snapshotted at booking). Professional's view only. */
    commissionBps: row.commission_bps,
    ...parts,
  }
}

/**
 * The invited professional's view. Before confirmation: locality, distance and the
 * customer's first name only. The full address appears once confirmed and disappears
 * 24 hours after completion.
 */
export async function getWorkerRequest(actor: Actor, invitationId: string, now: Date = new Date()) {
  if (!actor.workerId || !z.uuid().safeParse(invitationId).success)
    throw notFound('Request not found')
  const [inv] = await getDb()
    .select({ bookingId: bookingInvitations.bookingId, seenAt: bookingInvitations.seenAt })
    .from(bookingInvitations)
    .where(
      and(eq(bookingInvitations.id, invitationId), eq(bookingInvitations.workerId, actor.workerId)),
    )
  if (!inv) throw notFound('Request not found')
  await expireDue(now, inv.bookingId)
  if (!inv.seenAt) {
    await getDb()
      .update(bookingInvitations)
      .set({
        seenAt: now,
        status: sql`case when ${bookingInvitations.status} = 'INVITED' then 'SEEN'::invitation_status else ${bookingInvitations.status} end`,
      })
      .where(eq(bookingInvitations.id, invitationId))
  }
  const row = await loadBase(sql`i.id = ${invitationId} and i.worker_id = ${actor.workerId}`)
  if (!row) throw notFound('Request not found')
  return workerProjection(row, actor, now)
}

/** A job assigned to the professional, by booking id (`/worker/bookings/[id]`). Others get 404. */
export async function getWorkerBooking(actor: Actor, bookingId: string, now: Date = new Date()) {
  if (!actor.workerId || !z.uuid().safeParse(bookingId).success) throw notFound('Job not found')
  await expireDue(now, bookingId)
  const row = await loadBase(
    sql`b.id = ${bookingId} and b.worker_id = ${actor.workerId} and i.worker_id = b.worker_id`,
  )
  if (!row) throw notFound('Job not found')
  return workerProjection(row, actor, now)
}

export type WorkerBookingView = Awaited<ReturnType<typeof getWorkerBooking>>

export type WorkerRequestView = Awaited<ReturnType<typeof getWorkerRequest>>

export type RequestListItem = {
  invitationId: string
  bookingId: string
  code: string
  status: BookingStatus
  invitationStatus: string
  serviceName: string
  customerFirstName: string
  localityLabel: string
  distanceKm: number
  timing: 'ON_DEMAND' | 'SCHEDULED'
  requestedStart: string
  latestOffer: { by: Party; amountPaise: number; status: string; expiresAt: string } | null
  expiresAt: string | null
}

const STATE_FILTERS = {
  new: sql`b.status = 'REQUESTED' and i.status in ('INVITED', 'SEEN')`,
  negotiating: sql`b.status = 'NEGOTIATING' and i.status not in ('DECLINED', 'EXPIRED', 'LOST')`,
  missed: sql`i.status in ('EXPIRED', 'LOST', 'DECLINED') or (b.status in ('EXPIRED', 'CANCELLED') and i.status <> 'WON')`,
} as const

export type RequestState = keyof typeof STATE_FILTERS

/** The worker's inbox (§10.7): new, negotiating, or missed requests. Never shows addresses. */
export async function listWorkerRequests(
  actor: Actor,
  state: RequestState,
  now: Date = new Date(),
): Promise<RequestListItem[]> {
  if (!actor.workerId) return []
  await expireDue(now)
  const rows = await getDb().execute<{
    invitation_id: string
    booking_id: string
    code: string
    status: BookingStatus
    invitation_status: string
    service_name: string
    customer_name: string | null
    locality_label: string
    distance_km: number | string
    timing: 'ON_DEMAND' | 'SCHEDULED'
    requested_start: Date | string
    expires_at: Date | string | null
    offer_by: Party | null
    offer_amount: number | null
    offer_status: string | null
    offer_expires: Date | string | null
  }>(sql`
    select i.id as invitation_id, b.id as booking_id, b.code, b.status, i.status as invitation_status,
           s.name as service_name, cu.name as customer_name, b.locality_label, i.distance_km,
           b.timing, b.requested_start, b.expires_at,
           o.offered_by as offer_by, o.amount_paise as offer_amount, o.status as offer_status, o.expires_at as offer_expires
    from booking_invitations i
    join bookings b on b.id = i.booking_id
    join services s on s.id = b.service_id
    join users cu on cu.id = b.customer_id
    left join lateral (
      select offered_by, amount_paise, status, expires_at from price_offers
      where booking_id = b.id and worker_id = i.worker_id order by round desc limit 1
    ) o on true
    where i.worker_id = ${actor.workerId} and (${STATE_FILTERS[state]})
    order by ${state === 'missed' ? sql`b.updated_at desc` : sql`b.expires_at asc nulls last`}
    limit 50`)
  return rows.map((r) => ({
    invitationId: r.invitation_id,
    bookingId: r.booking_id,
    code: r.code,
    status: r.status,
    invitationStatus: r.invitation_status,
    serviceName: r.service_name,
    customerFirstName: (r.customer_name ?? 'Customer').trim().split(/\s+/)[0],
    localityLabel: r.locality_label,
    distanceKm: Math.round(Number(r.distance_km) * 10) / 10,
    timing: r.timing,
    requestedStart: iso(r.requested_start)!,
    latestOffer:
      r.offer_by && r.offer_amount !== null
        ? {
            by: r.offer_by,
            amountPaise: r.offer_amount,
            status: r.offer_status!,
            expiresAt: iso(r.offer_expires)!,
          }
        : null,
    expiresAt: iso(r.expires_at),
  }))
}
