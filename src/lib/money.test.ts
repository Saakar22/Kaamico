import { describe, expect, it } from 'vitest'
import { applyBps, formatINR, parseRupeesInput, rupeesToPaise } from './money'

describe('formatINR', () => {
  it('uses Indian digit grouping and drops zero paise', () => {
    expect(formatINR(10_000_000)).toBe('₹1,00,000')
    expect(formatINR(65_000)).toBe('₹650')
  })

  it('shows two decimals when paise are present', () => {
    expect(formatINR(65_050)).toBe('₹650.50')
  })

  it('rejects non-integer amounts', () => {
    expect(() => formatINR(10.5)).toThrow(RangeError)
  })
})

describe('parseRupeesInput', () => {
  it.each([
    ['650', 65_000],
    ['₹1,00,000', 10_000_000],
    ['1,250.5', 125_050],
    [' Rs. 99.99 ', 9_999],
  ])('parses %j', (input, expected) => {
    expect(parseRupeesInput(input)).toBe(expected)
  })

  it.each(['', 'abc', '-5', '1.234', '1e3'])('rejects %j', (input) => {
    expect(parseRupeesInput(input)).toBeNull()
  })
})

describe('applyBps', () => {
  it('computes a 10% commission', () => {
    expect(applyBps(65_000, 1000)).toBe(6_500)
  })

  it('rounds half away from zero', () => {
    expect(applyBps(5, 1000)).toBe(1) // 0.5 paise → 1
    expect(applyBps(-5, 1000)).toBe(-1)
  })
})

describe('rupeesToPaise', () => {
  it('avoids floating point drift', () => {
    expect(rupeesToPaise(19.99)).toBe(1_999)
  })
})
