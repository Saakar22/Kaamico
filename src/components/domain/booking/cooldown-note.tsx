import { getT } from '@/i18n/server'
import { needsCooldownPrompt } from '@/modules/bookings/cooldown'

/** A gentle reminder for customers whose recent requests lapsed with quotes unanswered. */
export async function CooldownNote({ customerId }: { customerId: string }) {
  const [show, t] = await Promise.all([needsCooldownPrompt(customerId), getT()])
  if (!show) return null
  return (
    <p role="note" className="rounded-md bg-warning-700/10 px-3 py-2 text-sm text-ink-900">
      {t('book.cooldown')}
    </p>
  )
}
