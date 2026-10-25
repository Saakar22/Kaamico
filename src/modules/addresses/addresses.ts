import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { addresses, type AddressSnapshot } from '@/db/schema'
import { businessRule, notFound } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'

/** States for the cities Kaamico serves; a new city needs a line here. */
const CITY_STATES: Record<string, string> = { Pune: 'Maharashtra', Bengaluru: 'Karnataka' }

export type SavedAddress = {
  id: string
  label: 'HOME' | 'WORK' | 'OTHER'
  line1: string
  line2: string | null
  landmark: string | null
  locality: string | null
  city: string
  pincode: string
  isDefault: boolean
}

export async function listAddresses(userId: string): Promise<SavedAddress[]> {
  const rows = await getDb().execute<{
    id: string
    label: SavedAddress['label']
    line1: string
    line2: string | null
    landmark: string | null
    locality: string | null
    city: string
    pincode: string
    is_default: boolean
  }>(sql`
    select a.id, a.label, a.line1, a.line2, a.landmark, l.name as locality, a.city, a.pincode, a.is_default
    from addresses a left join localities l on l.id = a.locality_id
    where a.user_id = ${userId} and a.deleted_at is null
    order by a.is_default desc, a.created_at desc`)
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    line1: r.line1,
    line2: r.line2,
    landmark: r.landmark,
    locality: r.locality,
    city: r.city,
    pincode: r.pincode,
    isDefault: r.is_default,
  }))
}

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => v || null)

export const addressInput = z.object({
  label: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  line1: z.string().trim().min(3, 'Enter your flat or house and street').max(120),
  line2: optionalText,
  landmark: optionalText,
  localityId: z.uuid('Choose your area'),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit pincode'),
  isDefault: z.boolean().default(false),
})

/**
 * Saves an address. The point used for distance is the locality centre (no map picker
 * until P1), which is close enough for matching but never shown to anyone.
 */
export async function createAddress(actor: Actor, raw: unknown): Promise<SavedAddress> {
  const input = addressInput.parse(raw)
  const db = getDb()
  const [locality] = await db.execute<{ id: string; city: string; lat: number; lng: number }>(sql`
    select id, city, lat, lng from localities where id = ${input.localityId} and is_serviceable`)
  if (!locality) throw businessRule('UNKNOWN_LOCALITY', 'Choose an area from the list')
  const state = CITY_STATES[locality.city]
  if (!state) throw businessRule('UNKNOWN_LOCALITY', "Kaamico isn't available in that city yet")

  const id = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.userId, actor.userId), isNull(addresses.deletedAt)))
    const makeDefault = input.isDefault || existing.length === 0
    if (makeDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(and(eq(addresses.userId, actor.userId), eq(addresses.isDefault, true)))
    }
    const [row] = await tx
      .insert(addresses)
      .values({
        userId: actor.userId,
        label: input.label,
        line1: input.line1,
        line2: input.line2,
        landmark: input.landmark,
        localityId: locality.id,
        city: locality.city,
        state,
        pincode: input.pincode,
        lat: Number(locality.lat),
        lng: Number(locality.lng),
        isDefault: makeDefault,
      })
      .returning({ id: addresses.id })
    return row.id
  })
  return (await listAddresses(actor.userId)).find((a) => a.id === id)!
}

/** An address the user owns, with what a booking needs to snapshot it. */
export async function addressForBooking(userId: string, addressId: string) {
  if (!z.uuid().safeParse(addressId).success) throw notFound('Address not found')
  const [row] = await getDb().execute<{
    id: string
    line1: string
    line2: string | null
    landmark: string | null
    locality: string | null
    city: string
    state: string
    pincode: string
    lat: number
    lng: number
  }>(sql`
    select a.id, a.line1, a.line2, a.landmark, l.name as locality, a.city, a.state, a.pincode, a.lat, a.lng
    from addresses a left join localities l on l.id = a.locality_id
    where a.id = ${addressId} and a.user_id = ${userId} and a.deleted_at is null`)
  if (!row) throw notFound('Address not found')
  const snapshot: AddressSnapshot = {
    line1: row.line1,
    line2: row.line2,
    landmark: row.landmark,
    locality: row.locality,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
  }
  return {
    id: row.id,
    snapshot,
    lat: Number(row.lat),
    lng: Number(row.lng),
    localityLabel: row.locality ? `${row.locality}, ${row.city}` : row.city,
  }
}
