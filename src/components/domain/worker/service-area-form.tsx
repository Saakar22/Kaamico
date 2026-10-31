'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { NativeSelect } from '@/components/ui/input'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import { useApiAction } from './use-api-action'

const RADII = [2, 3, 5, 8, 10, 15, 20, 25]

export function ServiceAreaForm({
  localities,
  initial,
}: {
  localities: { id: string; city: string; name: string }[]
  initial: { localityId: string | null; radiusKm: number } | null
}) {
  const t = useT()
  const { pending, error, fieldErrors, run } = useApiAction()
  const cities = useMemo(() => [...new Set(localities.map((l) => l.city))], [localities])
  const [localityId, setLocalityId] = useState(initial?.localityId ?? '')
  const [radiusKm, setRadiusKm] = useState(String(initial?.radiusKm ?? 5))

  const save = (event: FormEvent) => {
    event.preventDefault()
    return run(
      () =>
        apiFetch('/api/v1/worker/service-area', {
          method: 'PUT',
          body: { localityId, radiusKm: Number(radiusKm) },
        }),
      { success: t('whours.areaSaved') },
    )
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={t('whours.baseArea')}
          required
          hint={t('whours.baseAreaHint')}
          error={fieldErrors.localityId}
        >
          {(field) => (
            <NativeSelect
              {...field}
              value={localityId}
              onChange={(e) => setLocalityId(e.target.value)}
            >
              <option value="" disabled>
                {t('whours.chooseArea')}
              </option>
              {cities.map((city) => (
                <optgroup key={city} label={city}>
                  {localities
                    .filter((l) => l.city === city)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label={t('whours.travel')} required error={fieldErrors.radiusKm}>
          {(field) => (
            <NativeSelect {...field} value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)}>
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {t('whours.upTo', { km: r })}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        loading={pending}
        loadingText={t('whours.saving')}
        disabled={!localityId}
        className="self-start"
      >
        {t('whours.saveArea')}
      </Button>
    </form>
  )
}
