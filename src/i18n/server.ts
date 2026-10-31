import { lang } from 'next/root-params'
import { DEFAULT_LOCALE, isLocale, type Locale } from './config'
import { en, type Messages } from './messages/en'
import { hi } from './messages/hi'
import { createTranslator, type Translate } from './translate'

const dictionaries: Record<Locale, Messages> = { en, hi }

/** The request's language, from the `[lang]` root param the proxy rewrote to. */
export async function getLocale(): Promise<Locale> {
  const value = await lang()
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export const messagesFor = (locale: Locale): Messages => dictionaries[locale]

/** `t()` for Server Components. Client Components use `useT()` from `./client`. */
export async function getT(): Promise<Translate> {
  return createTranslator(messagesFor(await getLocale()))
}
