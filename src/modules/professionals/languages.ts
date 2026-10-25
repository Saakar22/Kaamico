const NAMES: Record<string, string> = {
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
}

/** Language codes as names, e.g. ['mr', 'hi'] → "Marathi, Hindi". */
export function languageNames(codes: readonly string[]): string {
  return codes.map((c) => NAMES[c] ?? c.toUpperCase()).join(', ')
}
