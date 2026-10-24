import { cn } from '@/lib/cn'
import { formatINR, type Paise } from '@/lib/money'

/** Displays an amount in paise as rupees with tabular digits, e.g. ₹1,00,000. */
export function Money({ paise, className }: { paise: Paise; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatINR(paise)}</span>
}
