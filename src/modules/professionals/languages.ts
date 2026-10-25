/** Languages a professional can list, as ISO 639-1 codes. */
export const LANGUAGES = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  kn: 'Kannada',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
  bn: 'Bengali',
  gu: 'Gujarati',
  pa: 'Punjabi',
  ur: 'Urdu',
  or: 'Odia',
} as const

export type LanguageCode = keyof typeof LANGUAGES
export const LANGUAGE_CODES = Object.keys(LANGUAGES) as [LanguageCode, ...LanguageCode[]]

/** Language codes as names, e.g. ['mr', 'hi'] → "Marathi, Hindi". */
export function languageNames(codes: readonly string[]): string {
  return codes.map((c) => LANGUAGES[c as LanguageCode] ?? c.toUpperCase()).join(', ')
}
