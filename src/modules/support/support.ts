import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { bookings, notifications, supportTickets, ticketMessages } from '@/db/schema'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { enforceRateLimit } from '@/lib/rate-limit'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'
import { TICKET_CATEGORIES, type TicketCategory } from './labels'

/**
 * Help requests (IMPLEMENTATION_PLAN.md §10.14). Customers and professionals open a
 * ticket, optionally about one of their bookings, and talk to Kaamico in a thread.
 * Admins reply, and the owner is notified in-app in the same transaction.
 */

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
const isUuid = (v: string) => z.uuid().safeParse(v).success
const iso = (v: Date | string) => new Date(v).toISOString()

export const ticketInput = z.object({
  category: z.enum(TICKET_CATEGORIES),
  subject: z.string().trim().min(4, 'Add a short subject').max(150),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(4000),
  bookingId: z
    .union([z.literal(''), z.uuid()])
    .optional()
    .transform((v) => v || null),
})

export const messageInput = z.object({
  body: z.string().trim().min(1, 'Write a message').max(4000),
})

const isAdmin = (actor: Actor) => actor.scope === 'ADMIN' && actor.roles.includes('ADMIN')

/** Bookings the person can attach to a ticket: theirs as customer or as professional. */
async function ownsBooking(actor: Actor, bookingId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ customerId: bookings.customerId, workerId: bookings.workerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
  return (
    !!row &&
    (row.customerId === actor.userId || (!!actor.workerId && row.workerId === actor.workerId))
  )
}

/** The code of one of the person's bookings, to show "About KMC-…" on a new ticket. */
export async function bookingRefFor(actor: Actor, bookingId: string | undefined) {
  if (!bookingId || !isUuid(bookingId) || !(await ownsBooking(actor, bookingId))) return null
  const [row] = await getDb()
    .select({ code: bookings.code })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
  return row ? { id: bookingId, code: row.code } : null
}

export async function createTicket(actor: Actor, raw: unknown) {
  if (actor.scope !== 'USER') throw forbidden('Admins answer tickets from the console')
  const input = ticketInput.parse(raw)
  await enforceRateLimit(
    `tickets:user:${actor.userId}`,
    { limit: 5, windowSeconds: 24 * 3600 },
    'You have opened several requests today. Add to an existing one instead.',
  )
  if (input.bookingId && !(await ownsBooking(actor, input.bookingId))) {
    throw notFound('Booking not found')
  }
  return getDb().transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTickets)
      .values({
        userId: actor.userId,
        bookingId: input.bookingId,
        category: input.category,
        subject: input.subject,
      })
      .returning()
    await tx
      .insert(ticketMessages)
      .values({ ticketId: ticket.id, senderUserId: actor.userId, body: input.message })
    return { ticketId: ticket.id }
  })
}

export type TicketSummary = {
  id: string
  category: TicketCategory
  subject: string
  status: TicketStatus
  bookingCode: string | null
  lastMessageAt: string
  /** The last message came from Kaamico (the owner may want to read it). */
  awaitingOwner: boolean
  ownerName?: string | null
}

const summarySelect = sql`
  select t.id, t.category, t.subject, t.status, b.code as booking_code, t.created_at,
         u.name as owner_name,
         coalesce(last.created_at, t.created_at) as last_message_at,
         coalesce(last.sender_user_id <> t.user_id, false) as awaiting_owner
  from support_tickets t
  join users u on u.id = t.user_id
  left join bookings b on b.id = t.booking_id
  left join lateral (
    select m.created_at, m.sender_user_id from ticket_messages m
    where m.ticket_id = t.id order by m.id desc limit 1
  ) last on true`

type SummaryRow = {
  id: string
  category: TicketCategory
  subject: string
  status: TicketStatus
  booking_code: string | null
  owner_name: string | null
  last_message_at: Date | string
  awaiting_owner: boolean
}

const toSummary = (r: SummaryRow): TicketSummary => ({
  id: r.id,
  category: r.category,
  subject: r.subject,
  status: r.status,
  bookingCode: r.booking_code,
  lastMessageAt: iso(r.last_message_at),
  awaitingOwner: r.awaiting_owner,
  ownerName: r.owner_name,
})

export async function listMyTickets(actor: Actor): Promise<TicketSummary[]> {
  const rows = await getDb().execute<SummaryRow>(sql`
    ${summarySelect}
    where t.user_id = ${actor.userId}
    order by last_message_at desc
    limit 50`)
  return rows.map(toSummary)
}

export type TicketThread = TicketSummary & {
  bookingId: string | null
  createdAt: string
  messages: {
    id: number
    fromKaamico: boolean
    senderName: string | null
    body: string
    createdAt: string
  }[]
}

/** A ticket and its messages, for its owner or an admin. */
export async function getTicket(actor: Actor, ticketId: string): Promise<TicketThread> {
  if (!isUuid(ticketId)) throw notFound('Request not found')
  const db = getDb()
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId))
  if (!t || (t.userId !== actor.userId && !isAdmin(actor))) throw notFound('Request not found')
  const [[summary], messages] = await Promise.all([
    db.execute<SummaryRow>(sql`${summarySelect} where t.id = ${ticketId}`),
    db.execute<{
      id: number
      sender_user_id: string
      sender_name: string | null
      body: string
      created_at: Date | string
    }>(sql`
      select m.id, m.sender_user_id, u.name as sender_name, m.body, m.created_at
      from ticket_messages m join users u on u.id = m.sender_user_id
      where m.ticket_id = ${ticketId} order by m.id`),
  ])
  return {
    ...toSummary(summary),
    bookingId: t.bookingId,
    createdAt: t.createdAt.toISOString(),
    messages: messages.map((m) => ({
      id: Number(m.id),
      fromKaamico: m.sender_user_id !== t.userId,
      // Owners see "Kaamico support", never an admin's name.
      senderName: m.sender_user_id === t.userId || isAdmin(actor) ? m.sender_name : null,
      body: m.body,
      createdAt: iso(m.created_at),
    })),
  }
}

/**
 * Adds a message. The owner writing again reopens a resolved ticket; an admin reply
 * moves an open ticket to "in progress", assigns it to them and notifies the owner.
 */
export async function addTicketMessage(actor: Actor, ticketId: string, raw: unknown) {
  const input = messageInput.parse(raw)
  if (!isUuid(ticketId)) throw notFound('Request not found')
  return getDb().transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .for('update')
    const admin = isAdmin(actor)
    if (!t || (t.userId !== actor.userId && !admin)) throw notFound('Request not found')
    if (t.status === 'CLOSED')
      throw conflict('TICKET_CLOSED', 'This request is closed. Open a new one.')
    const [message] = await tx
      .insert(ticketMessages)
      .values({ ticketId, senderUserId: actor.userId, body: input.body })
      .returning()
    if (admin && t.userId !== actor.userId) {
      await tx
        .update(supportTickets)
        .set({
          status: t.status === 'OPEN' ? 'IN_PROGRESS' : t.status,
          assignedAdminId: t.assignedAdminId ?? actor.userId,
        })
        .where(eq(supportTickets.id, ticketId))
      const isWorker = await tx.execute<{ w: boolean }>(
        sql`select 'WORKER' = any(roles) and not ('CUSTOMER' = any(roles)) as w from users where id = ${t.userId}`,
      )
      await tx.insert(notifications).values({
        userId: t.userId,
        type: 'support.replied',
        title: 'Kaamico support replied',
        body: t.subject.slice(0, 500),
        link: `${isWorker[0]?.w ? '/worker/support' : '/support'}/${ticketId}`,
      })
    } else if (t.status === 'RESOLVED') {
      await tx.update(supportTickets).set({ status: 'OPEN' }).where(eq(supportTickets.id, ticketId))
    }
    return { id: Number(message.id), createdAt: message.createdAt.toISOString() }
  })
}

export const adminTicketQuery = z.object({
  status: z.enum(['ACTIVE', 'RESOLVED', 'CLOSED', 'ALL']).default('ACTIVE'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

const PAGE = 25

/** Active tickets (open or in progress), waiting longest first. */
export async function listAdminTickets(raw: unknown) {
  const q = adminTicketQuery.parse(raw)
  const filter =
    q.status === 'ACTIVE'
      ? sql`t.status in ('OPEN', 'IN_PROGRESS')`
      : q.status === 'ALL'
        ? sql`true`
        : sql`t.status = ${q.status}`
  const order = q.status === 'ACTIVE' ? sql`last_message_at asc` : sql`last_message_at desc`
  const rows = await getDb().execute<SummaryRow>(sql`
    ${summarySelect}
    where ${filter}
    order by ${order}, t.id
    limit ${PAGE + 1} offset ${(q.page - 1) * PAGE}`)
  return { items: rows.slice(0, PAGE).map(toSummary), page: q.page, hasMore: rows.length > PAGE }
}

export const ticketStatusInput = z.object({ status: z.enum(['OPEN', 'RESOLVED', 'CLOSED']) })

/** An admin marks a ticket resolved, closed or open again (audited). */
export async function setTicketStatus(
  admin: Actor,
  ticketId: string,
  raw: unknown,
  context: AuditContext,
) {
  const { status } = ticketStatusInput.parse(raw)
  if (!isUuid(ticketId)) throw notFound('Request not found')
  return getDb().transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .for('update')
    if (!t) throw notFound('Request not found')
    if (t.status === status)
      throw conflict('NO_CHANGE', `This request is already ${status.toLowerCase()}`)
    await tx
      .update(supportTickets)
      .set({ status, assignedAdminId: t.assignedAdminId ?? admin.userId })
      .where(and(eq(supportTickets.id, ticketId)))
    await writeAudit(tx, admin, context, {
      action: 'TICKET_STATUS_CHANGED',
      entityType: 'support_ticket',
      entityId: ticketId,
      before: { status: t.status },
      after: { status },
    })
    return { ticketId, status }
  })
}
