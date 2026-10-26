import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { serviceCategories, services } from '@/db/schema'
import { conflict, notFound, pgErrorCode } from '@/lib/errors'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'
import { CATALOG_TAG } from '@/modules/catalog/catalog'

/**
 * Categories and services (§5.3 `/admin/categories`). Nothing is deleted: bookings and
 * prices refer to services, so they are deactivated instead. Every change is audited
 * and expires the cached public catalog straight away.
 */

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens only')
  .max(60)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    // Omitted stays omitted (a patch leaves it alone); blank clears it.
    .transform((v) => (v === undefined ? undefined : v || null))
const paise = z.number().int().min(0).max(10_000_000).nullish()

// Defaults belong to creation only: in a patch they would overwrite unsent fields.
const categoryFields = z.object({
  slug,
  name: z.string().trim().min(2).max(80),
  description: optionalText(300),
  iconKey: z.string().regex(/^[a-z-]{2,40}$/, 'Choose an icon'),
  sortOrder: z.number().int().min(0).max(999),
  isActive: z.boolean(),
})
export const categoryInput = categoryFields.extend({
  sortOrder: categoryFields.shape.sortOrder.default(0),
  isActive: categoryFields.shape.isActive.default(true),
})
export const categoryPatch = categoryFields.partial()

const serviceFields = z.object({
  categoryId: z.uuid(),
  slug: slug.max(80),
  name: z.string().trim().min(2).max(100),
  description: optionalText(500),
  pricingUnit: z.enum(['PER_VISIT', 'PER_HOUR', 'PER_ITEM', 'PER_SQFT', 'FIXED']),
  typicalDurationMin: z.number().int().min(15).max(1440),
  referenceMinPaise: paise,
  referenceMaxPaise: paise,
  searchTerms: z.string().trim().max(500),
  isActive: z.boolean(),
})
const referenceRange = (
  s: { referenceMinPaise?: number | null; referenceMaxPaise?: number | null },
  ctx: z.RefinementCtx,
) => {
  if (
    s.referenceMinPaise != null &&
    s.referenceMaxPaise != null &&
    s.referenceMinPaise > s.referenceMaxPaise
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['referenceMaxPaise'],
      message: 'Must be at least the minimum',
    })
  }
}
export const serviceInput = serviceFields
  .extend({
    searchTerms: serviceFields.shape.searchTerms.default(''),
    isActive: serviceFields.shape.isActive.default(true),
  })
  .superRefine(referenceRange)
export const servicePatch = serviceFields.partial().superRefine(referenceRange)

export type AdminService = ReturnType<typeof toServiceView>
export type AdminCategory = typeof serviceCategories.$inferSelect & { services: AdminService[] }

/** Every category with its services, active or not, in display order. */
export async function listCatalogForAdmin(): Promise<AdminCategory[]> {
  const db = getDb()
  const [cats, svcs] = await Promise.all([
    db
      .select()
      .from(serviceCategories)
      .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name)),
    db.select().from(services).orderBy(asc(services.name)),
  ])
  return cats.map((c) => ({
    ...c,
    services: svcs.filter((s) => s.categoryId === c.id).map(toServiceView),
  }))
}

/** Unique slugs are the likely clash; turn the database error into a field message. */
async function saving<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      throw conflict('SLUG_TAKEN', 'That slug is already used', {
        issues: [{ path: 'slug', message: 'That slug is already used' }],
      })
    }
    throw error
  }
}

const changed = <T extends Record<string, unknown>>(before: T, patch: Partial<T>) =>
  Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => v !== undefined && before[k] !== v),
  ) as Partial<T>

export async function createCategory(admin: Actor, raw: unknown, context: AuditContext) {
  const input = categoryInput.parse(raw)
  const created = await saving(() =>
    getDb().transaction(async (tx) => {
      const [row] = await tx.insert(serviceCategories).values(input).returning()
      await writeAudit(tx, admin, context, {
        action: 'CATEGORY_CREATED',
        entityType: 'service_category',
        entityId: row.id,
        after: input,
      })
      return row
    }),
  )
  revalidateTag(CATALOG_TAG, { expire: 0 })
  return created
}

export async function updateCategory(
  admin: Actor,
  id: string,
  raw: unknown,
  context: AuditContext,
) {
  const patch = categoryPatch.parse(raw)
  if (!z.uuid().safeParse(id).success) throw notFound('Category not found')
  const updated = await saving(() =>
    getDb().transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(serviceCategories)
        .where(eq(serviceCategories.id, id))
        .for('update')
      if (!before) throw notFound('Category not found')
      const diff = changed(before, patch)
      if (Object.keys(diff).length === 0) return before
      const [row] = await tx
        .update(serviceCategories)
        .set(diff)
        .where(eq(serviceCategories.id, id))
        .returning()
      await writeAudit(tx, admin, context, {
        action: 'CATEGORY_UPDATED',
        entityType: 'service_category',
        entityId: id,
        before: Object.fromEntries(
          Object.keys(diff).map((k) => [k, before[k as keyof typeof before]]),
        ),
        after: diff,
      })
      return row
    }),
  )
  revalidateTag(CATALOG_TAG, { expire: 0 })
  return updated
}

export async function createService(admin: Actor, raw: unknown, context: AuditContext) {
  const input = serviceInput.parse(raw)
  const created = await saving(() =>
    getDb().transaction(async (tx) => {
      const [cat] = await tx
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(eq(serviceCategories.id, input.categoryId))
      if (!cat) throw notFound('Category not found')
      const [row] = await tx.insert(services).values(input).returning()
      await writeAudit(tx, admin, context, {
        action: 'SERVICE_CREATED',
        entityType: 'service',
        entityId: row.id,
        after: input,
      })
      return row
    }),
  )
  revalidateTag(CATALOG_TAG, { expire: 0 })
  return toServiceView(created)
}

export async function updateService(admin: Actor, id: string, raw: unknown, context: AuditContext) {
  const patch = servicePatch.parse(raw)
  if (!z.uuid().safeParse(id).success) throw notFound('Service not found')
  const updated = await saving(() =>
    getDb().transaction(async (tx) => {
      const [before] = await tx.select().from(services).where(eq(services.id, id)).for('update')
      if (!before) throw notFound('Service not found')
      const min =
        patch.referenceMinPaise !== undefined ? patch.referenceMinPaise : before.referenceMinPaise
      const max =
        patch.referenceMaxPaise !== undefined ? patch.referenceMaxPaise : before.referenceMaxPaise
      if (min != null && max != null && min > max) {
        throw conflict('INVALID_RANGE', 'The reference maximum must be at least the minimum', {
          issues: [{ path: 'referenceMaxPaise', message: 'Must be at least the minimum' }],
        })
      }
      const diff = changed(before, patch)
      if (Object.keys(diff).length === 0) return before
      const [row] = await tx.update(services).set(diff).where(eq(services.id, id)).returning()
      await writeAudit(tx, admin, context, {
        action: 'SERVICE_UPDATED',
        entityType: 'service',
        entityId: id,
        before: Object.fromEntries(
          Object.keys(diff).map((k) => [k, before[k as keyof typeof before]]),
        ),
        after: diff,
      })
      return row
    }),
  )
  revalidateTag(CATALOG_TAG, { expire: 0 })
  return toServiceView(updated)
}

/** Drops the generated search vector from responses. */
function toServiceView(row: typeof services.$inferSelect) {
  const rest: Partial<typeof row> = { ...row }
  delete rest.searchVector
  return rest as Omit<typeof row, 'searchVector'>
}
