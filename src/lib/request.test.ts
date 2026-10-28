import { describe, expect, it } from 'vitest'
import { clientIp } from './request'

const withHeaders = (headers: Record<string, string>) =>
  new Request('http://localhost/', { headers })

describe('clientIp', () => {
  it('uses the address our proxy appended, not what the client claims', () => {
    // The client sent "6.6.6.6"; our load balancer appended the real address.
    const request = withHeaders({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' })
    expect(clientIp(request, 1)).toBe('203.0.113.7')
    // A CDN in front of the load balancer adds one more trusted hop.
    expect(clientIp(withHeaders({ 'x-forwarded-for': '6.6.6.6, 198.51.100.2, 10.0.0.5' }), 2)).toBe(
      '198.51.100.2',
    )
  })

  it('ignores forwarding headers when no proxy is trusted', () => {
    expect(clientIp(withHeaders({ 'x-forwarded-for': '203.0.113.7' }), 0)).toBeNull()
  })

  it('falls back to X-Real-IP and rejects anything that is not an address', () => {
    expect(clientIp(withHeaders({ 'x-real-ip': '203.0.113.9' }), 1)).toBe('203.0.113.9')
    expect(clientIp(withHeaders({ 'x-forwarded-for': 'not an ip' }), 1)).toBeNull()
    expect(clientIp(withHeaders({}), 1)).toBeNull()
    // Fewer entries than trusted hops: nothing trustworthy to use.
    expect(clientIp(withHeaders({ 'x-forwarded-for': '203.0.113.7' }), 2)).toBeNull()
  })
})
