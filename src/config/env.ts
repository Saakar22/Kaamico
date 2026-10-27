import 'server-only'
import { z } from 'zod'

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string')

const BUILD_PHASE = 'phase-production-build'

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url().default('http://localhost:3000'),
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),
    DATABASE_URL: postgresUrl,
    DATABASE_URL_TEST: postgresUrl.optional(),
    OTP_MODE: z.enum(['simulated', 'msg91']).default('simulated'),
    PAYMENTS_MODE: z.enum(['simulated', 'razorpay']).default('simulated'),
    ALLOW_SIMULATION_IN_PRODUCTION: z.stringbool().default(false),
    /** Razorpay test mode (PAYMENTS_MODE=razorpay). Live keys are refused in this release. */
    RAZORPAY_KEY_ID: z
      .string()
      .regex(/^rzp_test_\w+$/, 'must be a Razorpay test key (rzp_test_…)')
      .optional(),
    RAZORPAY_KEY_SECRET: z.string().min(8).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(8).optional(),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().min(1).default('./storage'),
    COMMISSION_BPS: z.coerce.number().int().min(0).max(5000).default(1000),
    CRON_SECRET: z.string().min(32).optional(),
    /** Keys OTP hashes. A fixed development value is used outside production. */
    AUTH_SECRET: z.string().min(32).optional(),
    /** Scales every rate limit (e.g. 20 in development/CI so repeated test logins are not blocked). */
    RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),
    /** Set by Next.js; `phase-production-build` while running `next build`. */
    NEXT_PHASE: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENTS_MODE === 'razorpay') {
      for (const key of [
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when PAYMENTS_MODE=razorpay',
          })
        }
      }
    }
    // `next build` prerenders catalog pages from the database but never serves requests,
    // so the runtime-only rules apply when the app starts, not while building.
    if (env.NODE_ENV !== 'production' || env.NEXT_PHASE === BUILD_PHASE) return
    for (const key of ['CRON_SECRET', 'AUTH_SECRET'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' })
    }
    if (env.RATE_LIMIT_MULTIPLIER > 1 && !env.ALLOW_SIMULATION_IN_PRODUCTION) {
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_MULTIPLIER'],
        message: 'must be 1 in production',
      })
    }
    if (env.ALLOW_SIMULATION_IN_PRODUCTION) return
    for (const key of ['OTP_MODE', 'PAYMENTS_MODE'] as const) {
      if (env[key] === 'simulated') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            'simulated mode is not allowed in production (set ALLOW_SIMULATION_IN_PRODUCTION=true for public demos)',
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

/** Parses an environment source. Empty strings are treated as unset. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''))
  const result = envSchema.safeParse(cleaned)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  return result.data
}

let cached: Env | undefined

/**
 * Validated server environment. Read lazily, and production rules are skipped while
 * building, so `next build` needs only DATABASE_URL (for prerendered catalog pages).
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
