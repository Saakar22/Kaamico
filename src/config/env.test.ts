import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

const base = { DATABASE_URL: 'postgres://kaamico:pw@localhost:5432/kaamico_dev' }

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv(base)).toMatchObject({
      NODE_ENV: 'development',
      OTP_MODE: 'simulated',
      PAYMENTS_MODE: 'simulated',
      COMMISSION_BPS: 1000,
      ALLOW_SIMULATION_IN_PRODUCTION: false,
    })
  })

  it('treats empty strings as unset', () => {
    expect(parseEnv({ ...base, CRON_SECRET: '', COMMISSION_BPS: '' }).COMMISSION_BPS).toBe(1000)
  })

  it('requires a postgres DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/)
    expect(() => parseEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/)
  })

  const secrets = { CRON_SECRET: 'x'.repeat(32), AUTH_SECRET: 'y'.repeat(32) }

  it('refuses simulated modes in production', () => {
    expect(() => parseEnv({ ...base, ...secrets, NODE_ENV: 'production' })).toThrow(
      /OTP_MODE: simulated mode is not allowed/,
    )
  })

  it('allows simulated modes in production for explicit demos', () => {
    const env = parseEnv({
      ...base,
      ...secrets,
      NODE_ENV: 'production',
      ALLOW_SIMULATION_IN_PRODUCTION: 'true',
    })
    expect(env.OTP_MODE).toBe('simulated')
  })

  it.each(['CRON_SECRET', 'AUTH_SECRET'])(
    'requires %s in production, even for simulated demos',
    (key) => {
      expect(() =>
        parseEnv({
          ...base,
          ...secrets,
          [key]: undefined,
          NODE_ENV: 'production',
          ALLOW_SIMULATION_IN_PRODUCTION: 'true',
        }),
      ).toThrow(new RegExp(`${key}: required in production`))
    },
  )

  it('refuses loosened rate limits in real production', () => {
    expect(() =>
      parseEnv({
        ...base,
        ...secrets,
        NODE_ENV: 'production',
        OTP_MODE: 'msg91',
        PAYMENTS_MODE: 'razorpay',
        RATE_LIMIT_MULTIPLIER: '20',
      }),
    ).toThrow(/RATE_LIMIT_MULTIPLIER: must be 1 in production/)
  })

  it('needs only the database while `next build` prerenders pages', () => {
    const build = { ...base, NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }
    expect(() => parseEnv(build)).not.toThrow()
    // The same settings are still refused when the built app starts.
    expect(() => parseEnv({ ...build, NEXT_PHASE: 'phase-production-server' })).toThrow(
      /CRON_SECRET: required in production/,
    )
  })
})
