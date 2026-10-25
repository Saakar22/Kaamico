import 'server-only'
import { getEnv } from '@/config/env'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { maskPhone } from './phone'

export type OtpSender = {
  /** True when no SMS is sent and the code is shown on screen instead. */
  simulated: boolean
  send(phone: string, code: string): Promise<void>
}

const simulatedSender: OtpSender = {
  simulated: true,
  async send(phone) {
    logger.info({ phone: maskPhone(phone) }, 'simulated OTP issued (shown on screen, no SMS sent)')
  },
}

const msg91Sender: OtpSender = {
  simulated: false,
  async send() {
    // Real SMS needs a MSG91 account and TRAI DLT template registration (IMPLEMENTATION_PLAN.md §13).
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'SMS sign-in is not available yet. Please try again later.',
    )
  },
}

export function getOtpSender(): OtpSender {
  return getEnv().OTP_MODE === 'simulated' ? simulatedSender : msg91Sender
}
