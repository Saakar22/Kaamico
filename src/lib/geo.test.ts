import { describe, expect, it } from 'vitest'
import { haversineKm } from './geo'

describe('haversineKm', () => {
  it('measures straight-line distance', () => {
    expect(haversineKm(18.5074, 73.8077, 18.5074, 73.8077)).toBe(0)
    // Kothrud to Baner, Pune: about 6 km.
    expect(haversineKm(18.5074, 73.8077, 18.559, 73.7868)).toBeCloseTo(6.13, 1)
    // 0.009 degrees of latitude is about 1 km.
    expect(haversineKm(18.5, 73.8, 18.509, 73.8)).toBeCloseTo(1.0, 2)
  })
})
