'use client'

import { ChevronDown, LocateFixed, MapPin } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/dialog'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import {
  LOCATION_COOKIE,
  LOCATION_COOKIE_MAX_AGE,
  serializeLocation,
  type CustomerLocation,
} from '@/modules/location/location'

export type LocalityOption = {
  id: string
  city: string
  name: string
  pincode: string | null
  lat: number
  lng: number
}

/** Other components open the sheet by dispatching this event (see OpenLocationButton). */
export const OPEN_LOCATION_EVENT = 'kaamico:open-location'

type NearestResponse = {
  nearest: (LocalityOption & { distanceKm: number }) | null
  inServiceArea: boolean
}

function saveLocation(location: CustomerLocation) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${LOCATION_COOKIE}=${serializeLocation(location)}; Path=/; Max-Age=${LOCATION_COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

/** Header chip showing where we search; opens a sheet to pick a locality or use the device location. */
export function LocationChip({
  location,
  localities,
}: {
  location: CustomerLocation | null
  localities: LocalityOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const cities = useMemo(() => [...new Set(localities.map((l) => l.city))], [localities])
  const [city, setCity] = useState(location?.city ?? cities[0] ?? '')
  const [filter, setFilter] = useState('')
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState<string>()
  const t = useT()

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN_LOCATION_EVENT, show)
    return () => window.removeEventListener(OPEN_LOCATION_EVENT, show)
  }, [])

  const visible = localities.filter(
    (l) =>
      l.city === city &&
      (!filter ||
        l.name.toLowerCase().includes(filter.toLowerCase()) ||
        l.pincode?.startsWith(filter.trim())),
  )

  function choose(next: CustomerLocation) {
    saveLocation(next)
    setOpen(false)
    setMessage(undefined)
    router.refresh()
  }

  function locateDevice() {
    if (!('geolocation' in navigator)) {
      setMessage(t('location.noBrowserSupport'))
      return
    }
    setLocating(true)
    setMessage(undefined)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const lat = Number(coords.latitude.toFixed(4))
          const lng = Number(coords.longitude.toFixed(4))
          const inIndia = lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98
          const result = inIndia
            ? await apiFetch<NearestResponse>(`/api/v1/localities?lat=${lat}&lng=${lng}`)
            : { nearest: null, inServiceArea: false }
          if (!result.inServiceArea || !result.nearest) {
            setMessage(t('location.notInArea', { cities: cities.join(t('location.and')) }))
            return
          }
          choose({
            lat,
            lng,
            label: t('location.near', {
              place: `${result.nearest.name}, ${result.nearest.city}`,
            }),
            city: result.nearest.city,
            localityId: null,
            source: 'device',
          })
        } catch {
          setMessage(t('location.checkFailed'))
        } finally {
          setLocating(false)
        }
      },
      (error) => {
        setLocating(false)
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? t('location.accessOff')
            : t('location.findFailed'),
        )
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-11 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
          location
            ? 'border-border bg-surface text-ink-900 hover:bg-surface-muted'
            : 'border-brand-600 bg-brand-50 text-brand-700',
        )}
      >
        {location ? (
          <MapPin aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
        ) : (
          // Only this decorative dot pulses, so the label keeps full contrast throughout.
          <span
            aria-hidden="true"
            className="relative flex size-4 shrink-0 items-center justify-center"
          >
            <span className="absolute size-3 rounded-full bg-brand-600/40 motion-safe:animate-ping" />
            <MapPin className="relative size-4 text-brand-600" />
          </span>
        )}
        <span className="truncate">
          <span className="sr-only">{t('location.srLabel')}</span>
          {location?.label ?? t('location.setLocation')}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-600" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[min(40rem,calc(100dvh-4rem))] md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:animate-pop-in md:rounded-lg">
          <SheetHeader>
            <SheetTitle>{t('location.sheetTitle')}</SheetTitle>
            <SheetDescription>{t('location.sheetBody')}</SheetDescription>
          </SheetHeader>

          <Button
            variant="secondary"
            onClick={locateDevice}
            loading={locating}
            loadingText={t('location.finding')}
          >
            <LocateFixed aria-hidden="true" />
            {t('location.useCurrent')}
          </Button>
          {message && (
            <p role="status" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-900">
              {message}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <div role="group" aria-label={t('location.city')} className="flex gap-2">
              {cities.map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={c === city ? 'primary' : 'secondary'}
                  aria-pressed={c === city}
                  onClick={() => setCity(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('location.searchAreas', { city })}
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('location.areaPlaceholder')}
                autoComplete="off"
              />
            </label>
            <ul aria-label={t('location.areasIn', { city })} className="grid gap-1 sm:grid-cols-2">
              {visible.map((l) => {
                const current = location?.source === 'locality' && location.localityId === l.id
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      aria-current={current || undefined}
                      onClick={() =>
                        choose({
                          lat: l.lat,
                          lng: l.lng,
                          label: `${l.name}, ${l.city}`,
                          city: l.city,
                          localityId: l.id,
                          source: 'locality',
                        })
                      }
                      className={cn(
                        'flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-surface-muted',
                        current && 'bg-brand-50 font-semibold text-brand-700',
                      )}
                    >
                      <span>{l.name}</span>
                      {l.pincode && <span className="text-sm text-ink-600">{l.pincode}</span>}
                    </button>
                  </li>
                )
              })}
              {visible.length === 0 && (
                <li className="px-3 py-2 text-sm text-ink-600">
                  {t('location.noAreas', { filter })}
                </li>
              )}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Opens the location sheet from anywhere on the page (e.g. an empty state). */
export function OpenLocationButton({ children }: { children?: string }) {
  const t = useT()
  return (
    <Button onClick={() => window.dispatchEvent(new Event(OPEN_LOCATION_EVENT))}>
      <MapPin aria-hidden="true" />
      {children ?? t('location.setLocation')}
    </Button>
  )
}
