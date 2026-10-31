'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Money } from '@/components/ui/money'
import { MoneyInput } from '@/components/ui/money-input'
import { Switch } from '@/components/ui/switch'
import { useLocale, useT } from '@/i18n/client'
import type { MessageKey } from '@/i18n/translate'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { formatDuration, unitSuffix } from '@/modules/catalog/units'
import type { PricingRow } from '@/modules/workers/pricing'
import { useApiAction } from './use-api-action'

const MIN = 5_000
const MAX = 10_000_000

type Draft = {
  pricePaise: number | null
  minChargePaise: number | null
  negotiable: boolean
  active: boolean
}

function draftOf(row: PricingRow): Draft {
  return row.price
    ? { ...row.price }
    : { pricePaise: null, minChargePaise: null, negotiable: true, active: false }
}

function problem(d: Draft): MessageKey | null {
  if (!d.active && d.pricePaise === null) return null
  if (d.pricePaise === null) return 'wpricing.enterPrice'
  if (d.pricePaise < MIN) return 'wpricing.atLeast'
  if (d.pricePaise > MAX) return 'wpricing.atMost'
  if (d.minChargePaise !== null && d.minChargePaise > d.pricePaise * 3) {
    return 'wpricing.minTooHigh'
  }
  return null
}

/** One row per service in the professional's skills. Only offered (switched on) services appear in search. */
export function PricingEditor({
  rows,
  commissionPercent,
}: {
  rows: PricingRow[]
  commissionPercent: number
}) {
  const t = useT()
  const locale = useLocale()
  const { pending, error, run } = useApiAction()
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(rows.map((r) => [r.serviceId, draftOf(r)])),
  )
  const change = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  const problems = Object.fromEntries(rows.map((r) => [r.serviceId, problem(drafts[r.serviceId])]))
  const invalid = Object.values(problems).some(Boolean)

  const save = (event: FormEvent) => {
    event.preventDefault()
    const items = rows
      .filter((r) => drafts[r.serviceId].pricePaise !== null)
      .map((r) => {
        const d = drafts[r.serviceId]
        return {
          serviceId: r.serviceId,
          pricePaise: d.pricePaise!,
          minChargePaise: d.minChargePaise ?? 0,
          negotiable: d.negotiable,
          active: d.active,
          version: r.price?.version,
        }
      })
    return run(() => apiFetch('/api/v1/worker/pricing', { method: 'PUT', body: { items } }), {
      success: t('wpricing.saved'),
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const d = drafts[r.serviceId]
          const heading =
            i === 0 || rows[i - 1].category.id !== r.category.id ? r.category.name : null
          const id = `svc-${r.serviceId}`
          return (
            <li key={r.serviceId} className="flex flex-col gap-2">
              {heading && <h3 className="mt-2 font-display text-lg font-semibold">{heading}</h3>}
              <fieldset
                className={cn(
                  'flex flex-col gap-3 rounded-md border p-4',
                  d.active ? 'border-border bg-surface' : 'border-border bg-surface-muted',
                )}
              >
                <legend className="sr-only">{r.serviceName}</legend>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.serviceName}</p>
                    <p className="text-sm text-ink-600">
                      {t('wpricing.about', {
                        duration: formatDuration(r.typicalDurationMin, locale),
                      })}{' '}
                      · {t('wpricing.priced', { unit: unitSuffix(r.unit, locale) })}
                      {r.referenceMinPaise !== null && r.referenceMaxPaise !== null && (
                        <>
                          {' · '}
                          {t('wpricing.guide')} <Money paise={r.referenceMinPaise} />–
                          <Money paise={r.referenceMaxPaise} />
                        </>
                      )}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Switch
                      checked={d.active}
                      onCheckedChange={(active) => change(r.serviceId, { active })}
                      aria-label={t('wpricing.offer', { service: r.serviceName })}
                    />
                    {d.active ? t('wpricing.offered') : t('wpricing.off')}
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label
                    className="flex flex-col gap-1.5 text-sm font-medium"
                    htmlFor={`${id}-price`}
                  >
                    {t('wpricing.yourPrice', { unit: unitSuffix(r.unit, locale) })}
                    <MoneyInput
                      id={`${id}-price`}
                      value={d.pricePaise}
                      onValueChange={(pricePaise) => change(r.serviceId, { pricePaise })}
                      aria-invalid={problems[r.serviceId] ? true : undefined}
                    />
                  </label>
                  <label
                    className="flex flex-col gap-1.5 text-sm font-medium"
                    htmlFor={`${id}-min`}
                  >
                    {t('wpricing.minimum')}
                    <MoneyInput
                      id={`${id}-min`}
                      value={d.minChargePaise}
                      onValueChange={(minChargePaise) => change(r.serviceId, { minChargePaise })}
                    />
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox
                      checked={d.negotiable}
                      onChange={(e) => change(r.serviceId, { negotiable: e.target.checked })}
                    />
                    {t('wpricing.openToOffers')}
                  </label>
                </div>
                {problems[r.serviceId] && (
                  <p className="text-sm text-danger-700" role="alert">
                    {t(problems[r.serviceId]!)}
                  </p>
                )}
              </fieldset>
            </li>
          )
        })}
      </ul>
      <p className="text-sm text-ink-600">
        {t('wpricing.feeNote', { percent: commissionPercent })}
      </p>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        loading={pending}
        loadingText={t('wpricing.saving')}
        disabled={invalid}
        className="self-start"
      >
        {t('wpricing.save')}
      </Button>
    </form>
  )
}
