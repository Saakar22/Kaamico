import 'server-only'
import { asc, eq, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import {
  bookingCharges,
  bookings,
  bookingStatusHistory,
  priceOffers,
  type AddressSnapshot,
} from '@/db/schema'
import { conflict, notFound } from '@/lib/errors'
import { fromIst } from '@/lib/time'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'
import { closeRequestThread } from '@/modules/bookings/lifecycle'
import { addOutbox, appendHistory, expireDue, lockBooking, type Tx } from '@/modules/bookings/repo'
import {
  BOOKING_STATUSES,
  canTransition,
  OPEN_REQUEST,
  type BookingStatus,
} from '@/modules/bookings/state-machine'
import type { ChargeView, HistoryView } from '@/modules/bookings/views'

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)
const PAGE = 25
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal('').transform(() => undefined))

export const adminBookingQuery = z.object({
  status: z
    .enum(BOOKING_STATUSES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(60).optional(),
  /** Created on or after / before the end of these IST dates. */
  from: dateKey,
  to: dateKey,
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

export type AdminBookingItem = {
  id: string
  code: string
  status: BookingStatus
  serviceName: string
  customerName: string
  workerName: string
  city: string
  startsAt: string
  pricePaise: number | null
  createdAt: string
}

const istDay = (key: string, plusDays = 0) => {
  const [y, m, d] = key.split('-').map(Number)
  return fromIst(y, m, d + plusDays).toISOString()
}

/** Filterable bookings table (§5.3). The search matches the code, names and phone numbers. */
export async function listAdminBookings(
  raw: unknown,
): Promise<{ items: AdminBookingItem[]; page: number; hasMore: boolean }> {
  const q = adminBookingQuery.parse(raw)
  const filters: SQL[] = [sql`true`]
  if (q.status) filters.push(sql`b.status = ${q.status}`)
  if (q.city) filters.push(sql`b.address_snapshot->>'city' = ${q.city}`)
  if (q.from) filters.push(sql`b.created_at >= ${istDay(q.from)}::timestamptz`)
  if (q.to) filters.push(sql`b.created_at < ${istDay(q.to, 1)}::timestamptz`)
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    filters.push(sql`(b.code ilike ${like} or cu.name ilike ${like} or cu.phone like ${like}
      or w.display_name ilike ${like} or wu.phone like ${like})`)
  }
  const rows = await getDb().execute<{
    id: string
    code: string
    status: BookingStatus
    service_name: string
    customer_name: string | null
    worker_name: string
    city: string
    starts_at: Date | string
    price_paise: number | null
    created_at: Date | string
  }>(sql`
    select b.id, b.code, b.status, s.name as service_name, cu.name as customer_name,
           w.display_name as worker_name, b.address_snapshot->>'city' as city,
           coalesce(lower(b.slot), b.requested_start) as starts_at,
           coalesce(b.final_amount_paise, b.agreed_price_paise, b.listed_price_paise) as price_paise,
           b.created_at
    from bookings b
    join services s on s.id = b.service_id
    join users cu on cu.id = b.customer_id
    join lateral (
      select worker_id from booking_invitations
      where booking_id = b.id order by (worker_id = b.worker_id) desc nulls last limit 1
    ) i on true
    join worker_profiles w on w.id = i.worker_id
    join users wu on wu.id = w.user_id
    where ${sql.join(filters, sql` and `)}
    order by b.created_at desc, b.id desc
    limit ${PAGE + 1} offset ${(q.page - 1) * PAGE}`)
  return {
    items: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      serviceName: r.service_name,
      customerName: r.customer_name ?? 'Customer',
      workerName: r.worker_name,
      city: r.city,
      startsAt: iso(r.starts_at)!,
      pricePaise: r.price_paise,
      createdAt: iso(r.created_at)!,
    })),
    page: q.page,
    hasMore: rows.length > PAGE,
  }
}

/** The whole booking for investigation: both parties, every offer and message, charges, history. */
export async function getAdminBooking(bookingId: string, now: Date = new Date()) {
  if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found')
  await expireDue(now, bookingId)
  const db = getDb()
  const [b] = await db.execute<{
    id: string
    code: string
    status: BookingStatus
    version: number
    timing: 'ON_DEMAND' | 'SCHEDULED'
    requested_start: Date | string
    slot_start: Date | string | null
    slot_end: Date | string | null
    expires_at: Date | string | null
    created_at: Date | string
    service_name: string
    description: string | null
    address_snapshot: AddressSnapshot
    locality_label: string
    listed_price_paise: number | null
    agreed_price_paise: number | null
    approved_charges_paise: number
    final_amount_paise: number | null
    commission_bps: number
    start_code_attempts: number
    cancelled_by: string | null
    cancellation_reason: string | null
    customer_id: string
    customer_name: string | null
    customer_phone: string | null
    worker_id: string
    worker_user_id: string
    worker_name: string
    worker_phone: string | null
    assigned: boolean
  }>(sql`
    select b.id, b.code, b.status, b.version, b.timing, b.requested_start,
           lower(b.slot) as slot_start, upper(b.slot) as slot_end, b.expires_at, b.created_at,
           s.name as service_name, b.description, b.address_snapshot, b.locality_label,
           b.listed_price_paise, b.agreed_price_paise, b.approved_charges_paise,
           b.final_amount_paise, b.commission_bps, b.start_code_attempts, b.cancelled_by,
           b.cancellation_reason, cu.id as customer_id, cu.name as customer_name,
           cu.phone as customer_phone, w.id as worker_id, w.user_id as worker_user_id,
           w.display_name as worker_name, wu.phone as worker_phone,
           (b.worker_id is not null) as assigned
    from bookings b
    join services s on s.id = b.service_id
    join users cu on cu.id = b.customer_id
    join lateral (
      select worker_id from booking_invitations
      where booking_id = b.id order by (worker_id = b.worker_id) desc nulls last limit 1
    ) i on true
    join worker_profiles w on w.id = i.worker_id
    join users wu on wu.id = w.user_id
    where b.id = ${bookingId}`)
  if (!b) throw notFound('Booking not found')

  const [offers, messages, charges, history, paymentRows] = await Promise.all([
    db
      .select()
      .from(priceOffers)
      .where(eq(priceOffers.bookingId, b.id))
      .orderBy(asc(priceOffers.round)),
    db.execute<{
      id: string
      sender_user_id: string
      body: string
      redacted: boolean
      created_at: Date | string
    }>(sql`
      select id, sender_user_id, body, redacted, created_at from negotiation_messages
      where booking_id = ${b.id} order by created_at`),
    db
      .select()
      .from(bookingCharges)
      .where(eq(bookingCharges.bookingId, b.id))
      .orderBy(asc(bookingCharges.createdAt)),
    db
      .select()
      .from(bookingStatusHistory)
      .where(eq(bookingStatusHistory.bookingId, b.id))
      .orderBy(asc(bookingStatusHistory.createdAt), asc(bookingStatusHistory.id)),
    db.execute<{
      id: string
      provider: string
      status: string
      amount_paise: number
      failure_reason: string | null
      created_at: Date | string
      captured_at: Date | string | null
      receipt: string | null
    }>(sql`
      select p.id, p.provider, p.status, p.amount_paise, p.failure_reason, p.created_at,
             p.captured_at, (select number from invoices where booking_id = p.booking_id) as receipt
      from payments p where p.booking_id = ${bookingId} order by p.created_at`),
  ])

  return {
    id: b.id,
    code: b.code,
    status: b.status,
    version: b.version,
    timing: b.timing,
    requestedStart: iso(b.requested_start)!,
    slot: b.slot_start ? { start: iso(b.slot_start)!, end: iso(b.slot_end)! } : null,
    expiresAt: iso(b.expires_at),
    createdAt: iso(b.created_at)!,
    serviceName: b.service_name,
    description: b.description,
    address: b.address_snapshot,
    localityLabel: b.locality_label,
    price: {
      listedPaise: b.listed_price_paise,
      agreedPaise: b.agreed_price_paise,
      approvedChargesPaise: b.approved_charges_paise,
      totalPaise: b.final_amount_paise,
    },
    commissionBps: b.commission_bps,
    startCodeAttempts: b.start_code_attempts,
    cancelledBy: b.cancelled_by,
    cancellationReason: b.cancellation_reason,
    customer: { id: b.customer_id, name: b.customer_name ?? 'Customer', phone: b.customer_phone },
    worker: {
      id: b.worker_id,
      userId: b.worker_user_id,
      name: b.worker_name,
      phone: b.worker_phone,
      assigned: b.assigned,
    },
    cancellable: canTransition(b.status, 'CANCELLED', 'ADMIN'),
    payments: paymentRows.map((p) => ({
      id: p.id,
      provider: p.provider,
      status: p.status,
      amountPaise: p.amount_paise,
      failureReason: p.failure_reason,
      createdAt: iso(p.created_at)!,
      capturedAt: iso(p.captured_at),
    })),
    receiptNumber: paymentRows.find((p) => p.receipt)?.receipt ?? null,
    offers: offers.map((o) => ({
      id: o.id,
      round: o.round,
      offeredBy: o.offeredBy,
      amountPaise: o.amountPaise,
      note: o.note,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    messages: messages.map((m) => ({
      id: m.id,
      from: m.sender_user_id === b.customer_id ? ('CUSTOMER' as const) : ('WORKER' as const),
      body: m.body,
      redacted: m.redacted,
      createdAt: iso(m.created_at)!,
    })),
    charges: charges.map<ChargeView>((c) => ({
      id: c.id,
      kind: c.kind,
      description: c.description,
      amountPaise: c.amountPaise,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
    history: history.map<HistoryView & { metadata: unknown }>((h) => ({
      from: h.fromStatus,
      to: h.toStatus,
      actor: h.actorRole,
      reason: h.reason,
      at: h.createdAt.toISOString(),
      metadata: h.metadata,
    })),
  }
}

export type AdminBookingView = Awaited<ReturnType<typeof getAdminBooking>>

export const adminCancelInput = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Give a reason both sides will see (at least 10 characters)')
    .max(300),
  expectedVersion: z.number().int().positive(),
})

/** Cancels any non-terminal booking with a reason both sides are told (§11.3). Audited. */
export async function adminCancelBooking(
  admin: Actor,
  bookingId: string,
  raw: unknown,
  context: AuditContext,
  now: Date = new Date(),
) {
  const input = adminCancelInput.parse(raw)
  if (!z.uuid().safeParse(bookingId).success) throw notFound('Booking not found')
  await expireDue(now, bookingId)
  return getDb().transaction(async (tx) => {
    const booking = await lockBooking(tx, bookingId)
    if (booking.version !== input.expectedVersion) {
      throw conflict('STALE_VERSION', 'This booking changed. Reload it and try again.')
    }
    if (!canTransition(booking.status, 'CANCELLED', 'ADMIN')) {
      throw conflict('INVALID_TRANSITION', 'This booking can no longer be cancelled', {
        status: booking.status,
      })
    }
    await cancelAsAdmin(tx, admin, booking, input.reason, now)
    await writeAudit(tx, admin, context, {
      action: 'BOOKING_CANCELLED',
      entityType: 'booking',
      entityId: booking.id,
      before: { status: booking.status },
      after: { status: 'CANCELLED' },
      reason: input.reason,
    })
    return { bookingId: booking.id, status: 'CANCELLED' as const }
  })
}

/** The cancellation itself; the caller has locked the booking and writes the audit row. */
export async function cancelAsAdmin(
  tx: Tx,
  admin: Pick<Actor, 'userId'>,
  booking: { id: string; status: BookingStatus; version: number },
  reason: string,
  now: Date,
) {
  if (OPEN_REQUEST.includes(booking.status)) await closeRequestThread(tx, booking.id, now)
  await tx
    .update(bookings)
    .set({
      status: 'CANCELLED',
      cancelledBy: 'ADMIN',
      cancellationReason: reason,
      cancelledAt: now,
      version: booking.version + 1,
    })
    .where(eq(bookings.id, booking.id))
  await appendHistory(tx, {
    bookingId: booking.id,
    from: booking.status,
    to: 'CANCELLED',
    actorUserId: admin.userId,
    actorRole: 'ADMIN',
    reason,
  })
  await addOutbox(tx, 'booking.cancelled', { bookingId: booking.id, by: 'ADMIN' })
}
