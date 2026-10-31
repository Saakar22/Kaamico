import 'server-only'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { users } from '@/db/schema'
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@/i18n/config'

export const languageInput = z.object({ locale: z.enum(LOCALES) })

/**
 * The person's chosen language, kept on the account so it follows them to other devices
 * and so notifications reach them in it (the `kmc_lang` cookie covers one browser).
 */
export async function setPreferredLocale(userId: string, raw: unknown): Promise<Locale> {
  const { locale } = languageInput.parse(raw)
  await getDb().update(users).set({ preferredLocale: locale }).where(eq(users.id, userId))
  return locale
}

export async function getPreferredLocale(userId: string): Promise<Locale> {
  const [row] = await getDb()
    .select({ locale: users.preferredLocale })
    .from(users)
    .where(eq(users.id, userId))
  return isLocale(row?.locale) ? row.locale : DEFAULT_LOCALE
}
