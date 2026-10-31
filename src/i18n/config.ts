/**
 * Languages of the customer and professional screens (IMPLEMENTATION_PLAN.md §14, P2).
 * URLs carry no language: the proxy rewrites each request to `/<locale>/…` from the
 * `kmc_lang` cookie, so `[lang]` is a root param that server components read. The admin
 * console stays in English.
 */
export const LOCALES = ['en', 'hi'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'kmc_lang'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/** For `<html lang>` and Intl formatting. */
export const htmlLang: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN' }

/** Each language's own name, as shown in the switch. */
export const localeNames: Record<Locale, string> = { en: 'English', hi: 'हिन्दी' }
