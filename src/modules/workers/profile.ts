import 'server-only'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import {
  serviceCategories,
  services,
  workerProfiles,
  workerServicePricing,
  workerSkills,
} from '@/db/schema'
import { businessRule, forbidden, notFound } from '@/lib/errors'
import { getStorage } from '@/lib/storage'
import type { Actor } from '@/modules/auth/types'
import { latitude, longitude } from '@/modules/location/location'
import { nearestLocality, SERVICE_AREA_KM } from '@/modules/location/localities'
import { LANGUAGE_CODES } from '@/modules/professionals/languages'
import { claimUpload } from '@/modules/uploads/uploads'

/** The caller's worker profile id; every /worker API derives it from the session, never a parameter. */
export function workerIdOf(actor: Actor): string {
  if (!actor.workerId) throw forbidden('Set up your professional profile first')
  return actor.workerId
}

export const profileInput = z.object({
  displayName: z.string().trim().min(2, 'Enter at least 2 characters').max(60),
  bio: z
    .string()
    .trim()
    .max(600, 'Keep it under 600 characters')
    .transform((v) => v || null),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  languages: z
    .array(z.enum(LANGUAGE_CODES))
    .min(1, 'Choose at least one language')
    .max(6)
    .transform((l) => [...new Set(l)]),
  /** A fresh PROFILE_PHOTO upload to use as the photo. */
  photoUploadId: z.uuid().optional(),
})
export type ProfileInput = z.input<typeof profileInput>

export type OwnProfile = {
  workerId: string
  displayName: string
  bio: string | null
  yearsExperience: number
  languages: string[]
  hasPhoto: boolean
  verificationStatus: string
  categoryIds: string[]
  serviceArea: {
    lat: number
    lng: number
    radiusKm: number
    locality: { id: string; name: string; city: string } | null
  } | null
}

const parseArray = (value: string[] | string): string[] =>
  Array.isArray(value) ? value : value.replace(/[{}]/g, '').split(',').filter(Boolean)

export async function getOwnProfile(workerId: string): Promise<OwnProfile> {
  const db = getDb()
  const [row] = await db.execute<{
    id: string
    display_name: string
    bio: string | null
    years_experience: number
    languages: string[] | string
    photo_key: string | null
    verification_status: string
    base_lat: number | null
    base_lng: number | null
    service_radius_km: number | string
    locality_id: string | null
    locality_name: string | null
    city: string | null
  }>(sql`
    select w.id, w.display_name, w.bio, w.years_experience, w.languages, w.photo_key,
           w.verification_status, w.base_lat, w.base_lng, w.service_radius_km,
           l.id as locality_id, l.name as locality_name, l.city
    from worker_profiles w left join localities l on l.id = w.base_locality_id
    where w.id = ${workerId}`)
  if (!row) throw notFound('Professional profile not found')
  const skills = await db
    .select({ categoryId: workerSkills.categoryId })
    .from(workerSkills)
    .where(eq(workerSkills.workerId, workerId))
  return {
    workerId: row.id,
    displayName: row.display_name,
    bio: row.bio,
    yearsExperience: row.years_experience,
    languages: parseArray(row.languages),
    hasPhoto: row.photo_key !== null,
    verificationStatus: row.verification_status,
    categoryIds: skills.map((s) => s.categoryId),
    serviceArea:
      row.base_lat === null || row.base_lng === null
        ? null
        : {
            lat: Number(row.base_lat),
            lng: Number(row.base_lng),
            radiusKm: Number(row.service_radius_km),
            locality: row.locality_id
              ? { id: row.locality_id, name: row.locality_name!, city: row.city! }
              : null,
          },
  }
}

export async function updateProfile(actor: Actor, raw: unknown): Promise<OwnProfile> {
  const workerId = workerIdOf(actor)
  const input = profileInput.parse(raw)
  let replacedPhotoKey: string | null = null
  await getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ photoKey: workerProfiles.photoKey })
      .from(workerProfiles)
      .where(eq(workerProfiles.id, workerId))
      .for('update')
    let photoKey = current.photoKey
    if (input.photoUploadId) {
      const upload = await claimUpload(tx, {
        uploadId: input.photoUploadId,
        ownerUserId: actor.userId,
        purpose: 'PROFILE_PHOTO',
      })
      replacedPhotoKey = current.photoKey
      photoKey = upload.storageKey
    }
    await tx
      .update(workerProfiles)
      .set({
        displayName: input.displayName,
        bio: input.bio,
        yearsExperience: input.yearsExperience,
        languages: input.languages,
        photoKey,
        version: sql`${workerProfiles.version} + 1`,
      })
      .where(eq(workerProfiles.id, workerId))
  })
  // The old photo is no longer referenced; remove it once the change is committed.
  if (replacedPhotoKey) await getStorage().delete(replacedPhotoKey)
  return getOwnProfile(workerId)
}

export const MAX_SKILLS = 5

export const skillsInput = z.object({
  categoryIds: z
    .array(z.uuid())
    .min(1, 'Choose at least one skill')
    .max(MAX_SKILLS, `Choose up to ${MAX_SKILLS} skills`)
    .transform((ids) => [...new Set(ids)]),
})

/** Replaces the skill set. Prices for services outside the new skills are switched off. */
export async function setSkills(actor: Actor, raw: unknown): Promise<string[]> {
  const workerId = workerIdOf(actor)
  const { categoryIds } = skillsInput.parse(raw)
  return getDb().transaction(async (tx) => {
    const active = await tx
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(and(inArray(serviceCategories.id, categoryIds), eq(serviceCategories.isActive, true)))
    if (active.length !== categoryIds.length) {
      throw businessRule('UNKNOWN_CATEGORY', 'One of the chosen skills is not available')
    }
    // Deactivate prices first: an active price requires the skill (database trigger).
    await tx
      .update(workerServicePricing)
      .set({ isActive: false, version: sql`${workerServicePricing.version} + 1` })
      .where(
        and(
          eq(workerServicePricing.workerId, workerId),
          eq(workerServicePricing.isActive, true),
          notInArray(
            workerServicePricing.serviceId,
            tx
              .select({ id: services.id })
              .from(services)
              .where(inArray(services.categoryId, categoryIds)),
          ),
        ),
      )
    await tx
      .delete(workerSkills)
      .where(
        and(eq(workerSkills.workerId, workerId), notInArray(workerSkills.categoryId, categoryIds)),
      )
    await tx
      .insert(workerSkills)
      .values(categoryIds.map((categoryId) => ({ workerId, categoryId })))
      .onConflictDoNothing()
    return categoryIds
  })
}

export const serviceAreaInput = z.union([
  z.object({ localityId: z.uuid(), radiusKm: z.coerce.number().min(1).max(25) }),
  z.object({ lat: latitude, lng: longitude, radiusKm: z.coerce.number().min(1).max(25) }),
])

/**
 * Sets the base point used for distance (private: never shown to anyone) and how far
 * the professional will travel.
 */
export async function setServiceArea(actor: Actor, raw: unknown) {
  const workerId = workerIdOf(actor)
  const input = serviceAreaInput.parse(raw)
  const db = getDb()
  let base: { lat: number; lng: number; localityId: string }
  if ('localityId' in input) {
    const [locality] = await db.execute<{ id: string; lat: number; lng: number }>(sql`
      select id, lat, lng from localities where id = ${input.localityId} and is_serviceable`)
    if (!locality) throw businessRule('UNKNOWN_LOCALITY', 'Choose an area from the list')
    base = { lat: Number(locality.lat), lng: Number(locality.lng), localityId: locality.id }
  } else {
    const nearest = await nearestLocality(input.lat, input.lng)
    if (!nearest || nearest.distanceKm > SERVICE_AREA_KM) {
      throw businessRule('OUT_OF_SERVICE_AREA', "Kaamico isn't available in that area yet")
    }
    base = { lat: input.lat, lng: input.lng, localityId: nearest.id }
  }
  await db
    .update(workerProfiles)
    .set({
      baseLat: base.lat,
      baseLng: base.lng,
      baseLocalityId: base.localityId,
      serviceRadiusKm: Math.round(input.radiusKm * 10) / 10,
      version: sql`${workerProfiles.version} + 1`,
    })
    .where(eq(workerProfiles.id, workerId))
  return (await getOwnProfile(workerId)).serviceArea
}
