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

  it('refuses simulated modes in production', () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', CRON_SECRET: 'x'.repeat(32) }),
    ).toThrow(/OTP_MODE: simulated mode is not allowed/)
  })

  it('allows simulated modes in production for explicit demos', () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: 'production',
      CRON_SECRET: 'x'.repeat(32),
      ALLOW_SIMULATION_IN_PRODUCTION: 'true',
    })
    expect(env.OTP_MODE).toBe('simulated')
  })

  it('requires CRON_SECRET in production', () => {
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        OTP_MODE: 'msg91',
        PAYMENTS_MODE: 'razorpay',
      }),
    ).toThrow(/CRON_SECRET: required in production/)
  })
})
