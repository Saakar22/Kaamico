import 'server-only'
import { getEnv } from '@/config/env'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export type Email = { to: string; subject: string; text: string }
export type SentEmail = Email & { sentAt: string }

const MAILBOX_SIZE = 50
const store = globalThis as typeof globalThis & { __kmcMailbox?: SentEmail[] }

/** Emails "sent" in console mode, newest first (this server process only). For /dev/mailbox. */
export function devMailbox(): readonly SentEmail[] {
  return store.__kmcMailbox ?? []
}

/**
 * Sends a transactional email. In console mode (the default until an email provider is
 * set up, IMPLEMENTATION_PLAN.md §13) nothing leaves the server: the message is logged
 * and kept for /dev/mailbox.
 */
export async function sendEmail(email: Email): Promise<void> {
  const env = getEnv()
  if (env.EMAIL_MODE === 'console') {
    const box = (store.__kmcMailbox ??= [])
    box.unshift({ ...email, sentAt: new Date().toISOString() })
    box.length = Math.min(box.length, MAILBOX_SIZE)
    // The body can hold one-time links, so it is logged only outside production.
    logger.info(
      { subject: email.subject, ...(env.NODE_ENV !== 'production' && { text: email.text }) },
      'email not sent (console mode)',
    )
    return
  }
  // Resend needs an account, a verified sending domain and RESEND_API_KEY.
  throw new AppError('SERVICE_UNAVAILABLE', 'Email is not set up yet.')
}
