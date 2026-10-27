import { describe, expect, it } from 'vitest'
import { scrubEvent, scrubText } from './sentry-scrub'

describe('scrubText', () => {
  it('removes Indian mobile numbers, emails and UPI ids, keeps Kaamico ids', () => {
    expect(scrubText('OTP for +91 98765 43210 failed')).toBe('OTP for [phone] failed')
    expect(scrubText('call 9876543210 or +919876543210')).toBe('call [phone] or [phone]')
    expect(scrubText('mail priya@example.com')).toBe('mail [email]')
    expect(scrubText('pay rakesh.p@okaxis now')).toBe('pay [upi] now')
    expect(scrubText('booking KMC-7QX2A9 id 3f1c2b9e-0d4f-4a8e-9b2c-1a2b3c4d5e6f')).toBe(
      'booking KMC-7QX2A9 id 3f1c2b9e-0d4f-4a8e-9b2c-1a2b3c4d5e6f',
    )
  })
})

describe('scrubEvent', () => {
  it('drops the user, cookies, bodies, sensitive headers and local variables', () => {
    const event = scrubEvent({
      message: 'Failed for 9876543210',
      user: { id: 'u', ip_address: '1.2.3.4' },
      extra: { address: 'Flat 2' },
      request: {
        cookies: { kmc_session: 'secret' },
        data: '{"phone":"9876543210"}',
        query_string: 'q=x',
        headers: { Cookie: 'kmc_session=secret', Authorization: 'Bearer x', 'User-Agent': 'UA' },
      },
      exception: {
        values: [
          { value: 'Bad +91 98765 43210', stacktrace: { frames: [{ vars: { token: 'x' } }] } },
        ],
      },
      breadcrumbs: [{ message: 'priya@example.com logged in', data: { a: 1 } }],
    })
    expect(event).toEqual({
      message: 'Failed for [phone]',
      request: { headers: { 'User-Agent': 'UA' } },
      exception: { values: [{ value: 'Bad [phone]', stacktrace: { frames: [{}] } }] },
      breadcrumbs: [{ message: '[email] logged in' }],
    })
  })
})
