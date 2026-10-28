'use client'

import { Download } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { canPromptInstall, promptInstall, subscribeInstall } from './install'
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from './theme'

const THEMES: { value: ThemeChoice; label: string; description: string }[] = [
  {
    value: 'system',
    label: 'Same as this device',
    description: 'Changes with your phone settings',
  },
  { value: 'light', label: 'Light', description: 'Dark text on a light background' },
  { value: 'dark', label: 'Dark', description: 'Easier on the eyes at night' },
]

type Platform = { installed: boolean; ios: boolean }

/** Appearance (light / dark) and installing Kaamico as an app. Saved in this browser only. */
export function AppSettings() {
  const [theme, setTheme] = useState<ThemeChoice>('system')
  const [platform, setPlatform] = useState<Platform | null>(null)
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false)

  // Browser-only facts, read after hydration so the server and client markup agree.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser state once on mount */
    setTheme(readThemeChoice())
    setPlatform({
      installed: window.matchMedia('(display-mode: standalone)').matches,
      ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
    })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const choose = (value: string) => {
    const choice = value as ThemeChoice
    setTheme(choice)
    applyThemeChoice(choice)
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">App settings</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 id="appearance-title" className="font-medium">
            Appearance
          </h3>
          <RadioGroup value={theme} onValueChange={choose} aria-labelledby="appearance-title">
            {THEMES.map((t) => (
              <RadioOption
                key={t.value}
                value={t.value}
                label={t.label}
                description={t.description}
              />
            ))}
          </RadioGroup>
        </div>

        <section aria-labelledby="install-title" className="flex flex-col gap-2">
          <h3 id="install-title" className="font-medium">
            Install the app
          </h3>
          {platform?.installed ? (
            <p className="text-sm text-ink-600">You are using the Kaamico app.</p>
          ) : canPrompt ? (
            <>
              <p className="text-sm text-ink-600">
                Add Kaamico to your home screen to open it like any other app.
              </p>
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => void promptInstall()}
              >
                <Download aria-hidden="true" className="size-4" />
                Install Kaamico
              </Button>
            </>
          ) : platform?.ios ? (
            <p className="text-sm text-ink-600">
              In Safari, tap the Share button, then &ldquo;Add to Home Screen&rdquo;.
            </p>
          ) : (
            <p className="text-sm text-ink-600">
              Open your browser&apos;s menu and choose &ldquo;Install app&rdquo; or &ldquo;Add to
              Home screen&rdquo;.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
