import { describe, expect, it } from 'vitest'
import { compactValue, niceTicks } from './scale'

describe('niceTicks', () => {
  it('covers the maximum with round steps from zero', () => {
    expect(niceTicks(0)).toEqual([0])
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8])
    expect(niceTicks(450_000)).toEqual([0, 200_000, 400_000, 600_000])
    expect(niceTicks(100)).toEqual([0, 50, 100])
  })
})

describe('compactValue', () => {
  it('shortens rupees and counts the Indian way', () => {
    expect(compactValue(95_000, 'paise')).toBe('₹950')
    expect(compactValue(120_000, 'paise')).toBe('₹1.2K')
    expect(compactValue(34_000_000, 'paise')).toBe('₹3.4L')
    expect(compactValue(2_000, 'count')).toBe('2K')
  })
})
