import 'server-only'
import { getEnv } from '@/config/env'

// Outside production a fixed key is fine: OTP codes are shown on screen anyway and
// signed file links only point at local development files. Production requires
// AUTH_SECRET (enforced in env.ts).
const DEV_AUTH_SECRET = 'kaamico-development-only-auth-secret-not-for-production'

/** Server-side key for HMACs (OTP hashes, signed file URLs). Callers add a purpose prefix. */
export const authSecret = (): string => getEnv().AUTH_SECRET ?? DEV_AUTH_SECRET
