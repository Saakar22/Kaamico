/**
 * Money is stored and transported as integer paise (₹1 = 100 paise).
 * Rates are integer basis points (10% = 1000 bps). Never use floats for amounts.
 */
export type Paise = number

function assertPaise(value: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Expected integer paise, got ${value}`)
}

export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new RangeError(`Invalid rupee amount: ${rupees}`)
  return Math.round(rupees * 100)
}

/**
 * Parses user input such as "650", "₹1,00,000", "1,250.50".
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function parseRupeesInput(input: string): Paise | null {
  const normalised = input.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '')
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null
  const [whole, fraction = ''] = normalised.split('.')
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

/** Applies a basis-point rate, rounding half away from zero to the nearest paisa. */
export function applyBps(amount: Paise, bps: number): Paise {
  assertPaise(amount)
  assertPaise(bps)
  const raw = (amount * bps) / 10_000
  return Math.sign(raw) * Math.round(Math.abs(raw))
}

const formatters = new Map<number, Intl.NumberFormat>()

function formatter(fractionDigits: number): Intl.NumberFormat {
  let f = formatters.get(fractionDigits)
  if (!f) {
    f = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
    formatters.set(fractionDigits, f)
  }
  return f
}

/** Formats paise with Indian digit grouping: 10000000 → "₹1,00,000"; 65050 → "₹650.50". */
export function formatINR(amount: Paise): string {
  assertPaise(amount)
  return formatter(amount % 100 === 0 ? 0 : 2).format(amount / 100)
}
