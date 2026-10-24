import 'server-only'
import { z } from 'zod'

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string')

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url().default('http://localhost:3000'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    DATABASE_URL: postgresUrl,
    DATABASE_URL_TEST: postgresUrl.optional(),
    OTP_MODE: z.enum(['simulated', 'msg91']).default('simulated'),
    PAYMENTS_MODE: z.enum(['simulated', 'razorpay']).default('simulated'),
    ALLOW_SIMULATION_IN_PRODUCTION: z.stringbool().default(false),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().min(1).default('./storage'),
    COMMISSION_BPS: z.coerce.number().int().min(0).max(5000).default(1000),
    CRON_SECRET: z.string().min(32).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production' || env.ALLOW_SIMULATION_IN_PRODUCTION) return
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
    if (!env.CRON_SECRET) {
      ctx.addIssue({ code: 'custom', path: ['CRON_SECRET'], message: 'required in production' })
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

/** Validated server environment. Read lazily so `next build` does not require runtime secrets. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
