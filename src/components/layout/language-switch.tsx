'use client'

import { Languages } from 'lucide-react'
import { useLocale, useT } from '@/i18n/client'
import { htmlLang, LOCALE_COOKIE, type Locale } from '@/i18n/config'

const YEAR_SECONDS = 365 * 24 * 60 * 60

/** Saves the language for the proxy and reloads the page in it. */
export function chooseLanguage(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${YEAR_SECONDS}; samesite=lax`
  window.location.reload()
}

/**
 * Switches between English and Hindi. The language lives in a cookie the proxy reads, so
 * a full reload shows the same page in the other language (the client router would
 * otherwise reuse pages it has already rendered).
 */
export function LanguageSwitch() {
  const locale = useLocale()
  const t = useT()
  const other: Locale = locale === 'hi' ? 'en' : 'hi'
  const choose = () => chooseLanguage(other)
  return (
    <button
      type="button"
      onClick={choose}
      lang={htmlLang[other]}
      aria-label={t('language.switchTo')}
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink-900 hover:bg-surface-muted"
    >
      <Languages aria-hidden="true" className="size-5" />
      <span aria-hidden="true">{other === 'hi' ? 'हिन्दी' : 'EN'}</span>
    </button>
  )
}
