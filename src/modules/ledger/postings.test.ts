import { describe, expect, it } from 'vitest'
import { commissionOf, netOf, postingsFor, refundPostingsFor } from './postings'

/** Deterministic pseudo-random integers, so the property checks are repeatable. */
function* samples(count: number, seed = 42) {
  let s = seed
  const next = () => (s = (s * 1_103_515_245 + 12_345) % 2 ** 31)
  for (let i = 0; i < count; i++) {
    yield { gross: next() % 10_000_000, bps: next() % 5_001 }
  }
}

const sum = (xs: { amountPaise: number }[]) => xs.reduce((t, x) => t + x.amountPaise, 0)

describe('commissionOf', () => {
  it('rounds half up to a whole paisa', () => {
    expect(commissionOf(65_000, 1000)).toBe(6_500)
    expect(commissionOf(5, 1000)).toBe(1) // 0.5 → 1
    expect(commissionOf(4, 1000)).toBe(0) // 0.4 → 0
    expect(commissionOf(12_345, 1250)).toBe(1_543) // 1543.125
    expect(commissionOf(0, 1000)).toBe(0)
  })

  it('refuses fractional amounts and impossible rates', () => {
    expect(() => commissionOf(10.5, 1000)).toThrow(RangeError)
    expect(() => commissionOf(-1, 1000)).toThrow(RangeError)
    expect(() => commissionOf(100, 10_001)).toThrow(RangeError)
  })
})

describe('postingsFor (properties over 2,000 amounts and rates)', () => {
  it('online: the balance effect is exactly the net, and every entry is whole paise', () => {
    for (const { gross, bps } of samples(2_000)) {
      if (gross === 0) continue
      const p = postingsFor({ grossPaise: gross, commissionBps: bps, method: 'SIMULATED' })
      expect(sum(p)).toBe(netOf(gross, bps))
      expect(p.every((x) => Number.isInteger(x.amountPaise) && x.amountPaise !== 0)).toBe(true)
    }
  })

  it('cash: the professional owes exactly the commission', () => {
    for (const { gross, bps } of samples(2_000, 7)) {
      if (gross === 0) continue
      const p = postingsFor({ grossPaise: gross, commissionBps: bps, method: 'CASH' })
      expect(sum(p)).toBe(-commissionOf(gross, bps))
    }
  })

  it('commission never exceeds the job and net is never negative', () => {
    for (const { gross, bps } of samples(2_000, 99)) {
      const c = commissionOf(gross, bps)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(gross)
      expect(netOf(gross, bps)).toBe(gross - c)
    }
  })

  it('uses the signs the database enforces', () => {
    expect(postingsFor({ grossPaise: 50_000, commissionBps: 1000, method: 'CASH' })).toEqual([
      { type: 'JOB_EARNING', amountPaise: 50_000 },
      { type: 'COMMISSION', amountPaise: -5_000 },
      { type: 'CASH_COLLECTED', amountPaise: -50_000 },
    ])
    // A zero commission posts no commission line (the ledger refuses zero amounts).
    expect(postingsFor({ grossPaise: 50_000, commissionBps: 0, method: 'SIMULATED' })).toEqual([
      { type: 'JOB_EARNING', amountPaise: 50_000 },
    ])
  })
})

describe('refundPostingsFor', () => {
  it('claws back the refund and returns the fee Kaamico no longer earns', () => {
    expect(
      refundPostingsFor({
        grossPaise: 65_000,
        commissionBps: 1000,
        refundPaise: 15_000,
        refundedBeforePaise: 0,
      }),
    ).toEqual([
      { type: 'REFUND_CLAWBACK', amountPaise: -15_000 },
      { type: 'ADJUSTMENT', amountPaise: 1_500 },
    ])
  })

  it('a full refund in pieces leaves the professional with nothing and Kaamico with no fee', () => {
    for (const { gross, bps } of samples(300)) {
      if (gross < 3) continue
      const job = postingsFor({ grossPaise: gross, commissionBps: bps, method: 'SIMULATED' })
      const parts = [Math.floor(gross / 3), Math.floor(gross / 3)]
      parts.push(gross - parts[0] - parts[1])
      let before = 0
      const refunds = parts.flatMap((refundPaise) => {
        const out = refundPostingsFor({
          grossPaise: gross,
          commissionBps: bps,
          refundPaise,
          refundedBeforePaise: before,
        })
        before += refundPaise
        return out
      })
      expect(sum(job) + sum(refunds)).toBe(0)
    }
  })

  it('after a partial refund the professional keeps the net of what was finally paid', () => {
    for (const { gross, bps } of samples(300, 7)) {
      if (gross < 2) continue
      const refund = Math.floor(gross / 2)
      const job = postingsFor({ grossPaise: gross, commissionBps: bps, method: 'SIMULATED' })
      const back = refundPostingsFor({
        grossPaise: gross,
        commissionBps: bps,
        refundPaise: refund,
        refundedBeforePaise: 0,
      })
      expect(sum(job) + sum(back)).toBe(netOf(gross - refund, bps))
    }
  })

  it('refuses refunds above what is left', () => {
    expect(() =>
      refundPostingsFor({
        grossPaise: 1000,
        commissionBps: 1000,
        refundPaise: 600,
        refundedBeforePaise: 500,
      }),
    ).toThrow(RangeError)
    expect(() =>
      refundPostingsFor({
        grossPaise: 1000,
        commissionBps: 1000,
        refundPaise: 0,
        refundedBeforePaise: 0,
      }),
    ).toThrow(RangeError)
  })
})
