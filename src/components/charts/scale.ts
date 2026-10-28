/** What chart values count: money in paise, or plain numbers. */
export type ChartUnit = 'paise' | 'count'

/**
 * Evenly spaced axis ticks from 0 that cover `max` with round steps (1, 2 or 5 × 10ⁿ),
 * e.g. 0 / 2,000 / 4,000 / 6,000. In paise the steps are whole rupees.
 */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0]
  const rough = max / target
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!
  const ticks: number[] = []
  for (let t = 0; t < max + step; t += step) {
    ticks.push(t)
    if (t >= max) break
  }
  return ticks
}

/** Short axis labels: 950, 1.2K, 3.4L (lakh), in rupees for money. */
export function compactValue(value: number, unit: ChartUnit): string {
  const n = unit === 'paise' ? value / 100 : value
  const prefix = unit === 'paise' ? '₹' : ''
  const trim = (x: number) => String(Number(x.toFixed(1)))
  if (n >= 100_000) return `${prefix}${trim(n / 100_000)}L`
  if (n >= 1_000) return `${prefix}${trim(n / 1_000)}K`
  return `${prefix}${Math.round(n)}`
}
