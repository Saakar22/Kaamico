'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { ApiError } from '@/lib/api-client'
import { DEFAULT_LOCALE, type Locale } from './config'
import { en, type Messages } from './messages/en'
import { createTranslator, type MessageKey, type Translate } from './translate'

const I18nContext = createContext<{ locale: Locale; t: Translate }>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(en),
})

/** Set once in the root layout with the request's dictionary. Without it, English. */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale
  messages: Messages
  children: ReactNode
}) {
  const value = useMemo(() => ({ locale, t: createTranslator(messages) }), [locale, messages])
  return <I18nContext value={value}>{children}</I18nContext>
}

export const useT = (): Translate => useContext(I18nContext).t
export const useLocale = (): Locale => useContext(I18nContext).locale

/**
 * Words for a failed API call. The server writes English; in Hindi a known error code
 * gets its translation, anything else keeps the server's message.
 */
export function useErrorMessage(): (error: unknown) => string {
  const { locale, t } = useContext(I18nContext)
  return (error) => {
    if (!(error instanceof ApiError)) return t('errors.generic')
    if (locale !== 'en') {
      const key = `errors.${error.code}` as MessageKey
      const translated = t(key)
      if (translated !== key) return translated
    }
    return error.message
  }
}
