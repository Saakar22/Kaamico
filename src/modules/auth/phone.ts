/**
 * Normalises Indian mobile input ("98765 43210", "+91-98765-43210", "098765 43210")
 * to E.164 (+919876543210). Returns null if it is not a valid Indian mobile number.
 */
export function normalizeIndianMobile(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, '')
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact)
  return match ? `+91${match[1]}` : null
}

/** "+919876543210" → "+91 98••• ••210" for display and logs. */
export function maskPhone(e164: string): string {
  const digits = e164.slice(3)
  return `+91 ${digits.slice(0, 2)}••• ••${digits.slice(-3)}`
}
