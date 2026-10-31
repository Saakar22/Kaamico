import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { workerServicePricing } from '@/db/schema'
import { businessRule, conflict } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import type { PricingUnit } from '@/modules/catalog/units'
import { workerIdOf } from './profile'
import type { Locale } from '@/i18n/config'
import { localized } from '@/modules/catalog/catalog'

/** ₹50 to ₹1,00,000 (also a database CHECK). */
export const MIN_PRICE_PAISE = 5_000
export const MAX_PRICE_PAISE = 10_000_000

export type PricingRow = {
  serviceId: string
  serviceName: string
  category: { id: string; name: string }
  unit: PricingUnit
  typicalDurationMin: number
  /** Platform guide range, for reference only. */
  referenceMinPaise: number | null
  referenceMaxPaise: number | null
  /** Null until the professional sets a price for this service. */
  price: {
    pricePaise: number
    minChargePaise: number
    negotiable: boolean
    active: boolean
    version: number
  } | null
}

/** Every service in the professional's skill categories, with their price if set. */
export async function getPricing(workerId: string, locale: Locale = 'en'): Promise<PricingRow[]> {
  const rows = await getDb().execute<{
    service_id: string
    service_name: string
    category_id: string
    category_name: string
    pricing_unit: PricingUnit
    typical_duration_min: number
    reference_min_paise: number | null
    reference_max_paise: number | null
    price_paise: number | null
    min_charge_paise: number | null
    is_negotiable: boolean | null
    is_active: boolean | null
    version: number | null
  }>(sql`
    select s.id as service_id, ${localized(locale, 's', 'name')} as service_name, c.id as category_id,
           ${localized(locale, 'c', 'name')} as category_name,
           s.pricing_unit, s.typical_duration_min, s.reference_min_paise, s.reference_max_paise,
           p.price_paise, p.min_charge_paise, p.is_negotiable, p.is_active, p.version
    from worker_skills ws
    join service_categories c on c.id = ws.category_id and c.is_active
    join services s on s.category_id = c.id and s.is_active
    left join worker_service_pricing p on p.worker_id = ws.worker_id and p.service_id = s.id
    where ws.worker_id = ${workerId}
    order by c.sort_order, c.name, s.name`)
  return rows.map((r) => ({
    serviceId: r.service_id,
    serviceName: r.service_name,
    category: { id: r.category_id, name: r.category_name },
    unit: r.pricing_unit,
    typicalDurationMin: r.typical_duration_min,
    referenceMinPaise: r.reference_min_paise,
    referenceMaxPaise: r.reference_max_paise,
    price:
      r.price_paise === null
        ? null
        : {
            pricePaise: r.price_paise,
            minChargePaise: r.min_charge_paise!,
            negotiable: r.is_negotiable!,
            active: r.is_active!,
            version: r.version!,
          },
  }))
}

const pricingItem = z
  .object({
    serviceId: z.uuid(),
    pricePaise: z
      .number()
      .int()
      .min(MIN_PRICE_PAISE, 'Prices start at ₹50')
      .max(MAX_PRICE_PAISE, 'Prices go up to ₹1,00,000'),
    minChargePaise: z.number().int().min(0),
    negotiable: z.boolean(),
    active: z.boolean(),
    /** The version last read; omit when creating a price. */
    version: z.number().int().positive().optional(),
  })
  .refine((i) => i.minChargePaise <= i.pricePaise * 3, {
    message: 'The minimum charge can be at most 3 times the price',
    path: ['minChargePaise'],
  })

export const pricingInput = z.object({
  items: z
    .array(pricingItem)
    .min(1)
    .max(60)
    .refine((items) => new Set(items.map((i) => i.serviceId)).size === items.length, {
      message: 'Each service can appear once',
    }),
})

/**
 * Creates or updates prices in one transaction. Bookings keep the price they were made
 * at, so changes only affect future requests.
 */
export async function savePricing(actor: Actor, raw: unknown): Promise<PricingRow[]> {
  const workerId = workerIdOf(actor)
  const { items } = pricingInput.parse(raw)
  const offered = new Map((await getPricing(workerId)).map((r) => [r.serviceId, r]))
  for (const item of items) {
    if (!offered.has(item.serviceId)) {
      throw businessRule(
        'SERVICE_NOT_IN_SKILLS',
        'Add the matching skill before pricing this service',
        { serviceId: item.serviceId },
      )
    }
  }

  await getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ serviceId: workerServicePricing.serviceId, version: workerServicePricing.version })
      .from(workerServicePricing)
      .where(
        and(
          eq(workerServicePricing.workerId, workerId),
          inArray(
            workerServicePricing.serviceId,
            items.map((i) => i.serviceId),
          ),
        ),
      )
      .for('update')
    const versions = new Map(existing.map((e) => [e.serviceId, e.version]))

    for (const item of items) {
      const unit = offered.get(item.serviceId)!.unit
      const current = versions.get(item.serviceId)
      // Someone (another tab or device) changed this price since it was read.
      if (current !== undefined && item.version !== current) {
        throw conflict('STALE_VERSION', 'This price was changed elsewhere. Reload and try again.', {
          serviceId: item.serviceId,
        })
      }
      const values = {
        pricePaise: item.pricePaise,
        minChargePaise: item.minChargePaise,
        isNegotiable: item.negotiable,
        isActive: item.active,
      }
      if (current === undefined) {
        await tx
          .insert(workerServicePricing)
          .values({ workerId, serviceId: item.serviceId, unit, ...values })
      } else {
        await tx
          .update(workerServicePricing)
          .set({ ...values, unit, version: current + 1 })
          .where(
            and(
              eq(workerServicePricing.workerId, workerId),
              eq(workerServicePricing.serviceId, item.serviceId),
            ),
          )
      }
    }
  })
  return getPricing(workerId)
}
