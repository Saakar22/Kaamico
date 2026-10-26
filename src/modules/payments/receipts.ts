import 'server-only'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { invoices, type InvoiceLineItem } from '@/db/schema'
import { notFound } from '@/lib/errors'
import { toIstParts } from '@/lib/time'
import type { Actor } from '@/modules/auth/types'
import type { Tx } from '@/modules/bookings/repo'

/** Indian financial year label for a date, e.g. "2026-27" (April to March, IST). */
export function financialYear(date: Date): string {
  const { year, month } = toIstParts(date)
  const start = month >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/**
 * Issues the booking receipt once, at capture, numbered KMC/<FY>/<6 digits> in sequence.
 * An advisory lock per financial year serialises numbering; the table is immutable and
 * `booking_id` is unique, so a receipt can never be issued twice or changed.
 */
export async function issueReceipt(
  tx: Tx,
  input: {
    bookingId: string
    lineItems: InvoiceLineItem[]
    totalPaise: number
    platformFeePaise: number
    now: Date
  },
): Promise<string> {
  const prefix = `KMC/${financialYear(input.now)}/`
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'receipt:' + prefix}))`)
  // The ::int matters: with a text parameter, `substring(x from $1)` is the regex form.
  const [{ last }] = await tx.execute<{ last: number | null }>(sql`
    select max(substring(number from ${prefix.length + 1}::int)::int) as last
    from invoices where number like ${prefix + '%'}`)
  const number = `${prefix}${String((last ?? 0) + 1).padStart(6, '0')}`
  await tx.insert(invoices).values({
    bookingId: input.bookingId,
    number,
    lineItems: input.lineItems,
    subtotalPaise: input.totalPaise,
    platformFeePaise: input.platformFeePaise,
    taxPaise: 0,
    totalPaise: input.totalPaise,
    issuedAt: input.now,
  })
  return number
}

export type ReceiptView = {
  number: string
  issuedAt: string
  bookingId: string
  bookingCode: string
  serviceName: string
  customerName: string
  workerName: string
  locality: string
  completedAt: string | null
  lineItems: InvoiceLineItem[]
  totalPaise: number
  paidWith: string
  simulated: boolean
  /** Kaamico's fee: shown to the professional and admins, not to the customer. */
  platformFeePaise: number | null
  viewer: 'customer' | 'worker' | 'admin'
}

/** The receipt for a booking: its customer, its professional or an admin. Others get 404. */
export async function getReceipt(actor: Actor, bookingId: string): Promise<ReceiptView> {
  if (!z.uuid().safeParse(bookingId).success) throw notFound('Receipt not found')
  const [r] = await getDb().execute<{
    number: string
    issued_at: Date | string
    line_items: InvoiceLineItem[]
    total_paise: number
    platform_fee_paise: number
    code: string
    service_name: string
    customer_id: string
    customer_name: string | null
    worker_id: string | null
    worker_name: string | null
    locality_label: string
    completed_at: Date | string | null
    provider: string | null
  }>(sql`
    select i.number, i.issued_at, i.line_items, i.total_paise, i.platform_fee_paise, b.code,
           s.name as service_name, b.customer_id, cu.name as customer_name, b.worker_id,
           w.display_name as worker_name, b.locality_label, b.completed_at,
           (select provider from payments p where p.booking_id = b.id and p.status = 'CAPTURED' limit 1) as provider
    from invoices i
    join bookings b on b.id = i.booking_id
    join services s on s.id = b.service_id
    join users cu on cu.id = b.customer_id
    left join worker_profiles w on w.id = b.worker_id
    where i.booking_id = ${bookingId}`)
  const viewer: ReceiptView['viewer'] | null = !r
    ? null
    : actor.scope === 'ADMIN' && actor.roles.includes('ADMIN')
      ? 'admin'
      : r.customer_id === actor.userId
        ? 'customer'
        : actor.workerId && r.worker_id === actor.workerId
          ? 'worker'
          : null
  if (!r || !viewer) throw notFound('Receipt not found')
  return {
    number: r.number,
    issuedAt: new Date(r.issued_at).toISOString(),
    bookingId,
    bookingCode: r.code,
    serviceName: r.service_name,
    customerName: r.customer_name ?? 'Customer',
    workerName: r.worker_name ?? 'Professional',
    locality: r.locality_label,
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    lineItems: r.line_items,
    totalPaise: r.total_paise,
    paidWith:
      r.provider === 'CASH' ? 'Cash' : r.provider === 'SIMULATED' ? 'Online (simulated)' : 'Online',
    simulated: r.provider === 'SIMULATED',
    platformFeePaise: viewer === 'customer' ? null : r.platform_fee_paise,
    viewer,
  }
}
