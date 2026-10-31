'use client'

import { Download } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { chooseLanguage } from '@/components/layout/language-switch'
import { RadioGroup, RadioOption } from '@/components/ui/radio-group'
import { useLocale, useT } from '@/i18n/client'
import { htmlLang, isLocale, LOCALES, localeNames } from '@/i18n/config'
import type { MessageKey } from '@/i18n/translate'
import { canPromptInstall, promptInstall, subscribeInstall } from './install'
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from './theme'

const THEMES: { value: ThemeChoice; label: MessageKey; description: MessageKey }[] = [
  { value: 'system', label: 'settings.system', description: 'settings.systemHint' },
  { value: 'light', label: 'settings.light', description: 'settings.lightHint' },
  { value: 'dark', label: 'settings.dark', description: 'settings.darkHint' },
]

type Platform = { installed: boolean; ios: boolean }

/**
 * Language, appearance (light / dark) and installing Kaamico as an app. Saved in this
 * browser only.
 */
export function AppSettings() {
  const t = useT()
  const locale = useLocale()
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
        <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 id="language-title" className="font-medium">
            {t('settings.language')}
          </h3>
          <RadioGroup
            value={locale}
            onValueChange={(value) => isLocale(value) && value !== locale && chooseLanguage(value)}
            aria-labelledby="language-title"
          >
            {LOCALES.map((l) => (
              <RadioOption
                key={l}
                value={l}
                label={<span lang={htmlLang[l]}>{localeNames[l]}</span>}
              />
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2">
          <h3 id="appearance-title" className="font-medium">
            {t('settings.appearance')}
          </h3>
          <RadioGroup value={theme} onValueChange={choose} aria-labelledby="appearance-title">
            {THEMES.map((option) => (
              <RadioOption
                key={option.value}
                value={option.value}
                label={t(option.label)}
                description={t(option.description)}
              />
            ))}
          </RadioGroup>
        </div>

        <section aria-labelledby="install-title" className="flex flex-col gap-2">
          <h3 id="install-title" className="font-medium">
            {t('settings.install')}
          </h3>
          {platform?.installed ? (
            <p className="text-sm text-ink-600">{t('settings.installed')}</p>
          ) : canPrompt ? (
            <>
              <p className="text-sm text-ink-600">{t('settings.addToHome')}</p>
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => void promptInstall()}
              >
                <Download aria-hidden="true" className="size-4" />
                {t('settings.installButton')}
              </Button>
            </>
          ) : platform?.ios ? (
            <p className="text-sm text-ink-600">{t('settings.ios')}</p>
          ) : (
            <p className="text-sm text-ink-600">{t('settings.other')}</p>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
