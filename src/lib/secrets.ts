import 'server-only'
import { DEV_AUTH_SECRET } from '@/config/dev-secret'
import { getEnv } from '@/config/env'

/** Server-side key for HMACs (OTP hashes, signed file URLs, start codes). Callers add a purpose prefix. */
export const authSecret = (): string => getEnv().AUTH_SECRET ?? DEV_AUTH_SECRET
