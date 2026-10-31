'use client'

import { Camera } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox, Input, Textarea } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { useLocale, useT } from '@/i18n/client'
import { htmlLang } from '@/i18n/config'
import { apiFetch } from '@/lib/api-client'
import { LANGUAGES, languageNames, type LanguageCode } from '@/modules/professionals/languages'
import { uploadFile, useApiAction } from './use-api-action'

export type ProfileFormValues = {
  displayName: string
  bio: string | null
  yearsExperience: number
  languages: string[]
  hasPhoto: boolean
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const t = useT()
  const lang = htmlLang[useLocale()]
  const { pending, error, fieldErrors, run, setError } = useApiAction()
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [bio, setBio] = useState(initial.bio ?? '')
  const [years, setYears] = useState(String(initial.yearsExperience))
  const [languages, setLanguages] = useState<string[]>(initial.languages)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(
    initial.hasPhoto ? '/api/v1/worker/profile/photo' : null,
  )

  function choosePhoto(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t('wprofile.photoTooBig'))
      return
    }
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    return run(
      async () => {
        const photoUploadId = photo ? await uploadFile(photo, 'PROFILE_PHOTO') : undefined
        await apiFetch('/api/v1/worker/profile', {
          method: 'PATCH',
          body: { displayName, bio, yearsExperience: Number(years), languages, photoUploadId },
        })
        setPhoto(null)
      },
      { success: t('wprofile.saved') },
    )
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-4">
        <Avatar name={displayName || t('wprofile.you')} src={preview} size="lg" />
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-brand-600 px-4 font-medium text-brand-700 focus-within:ring-2 focus-within:ring-brand-600 hover:bg-brand-50">
          <Camera aria-hidden="true" className="size-4" />
          {preview ? t('wprofile.changePhoto') : t('wprofile.addPhoto')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => choosePhoto(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="-mt-3 text-sm text-ink-600">{t('wprofile.photoHint')}</p>

      <FormField label={t('wprofile.displayName')} required error={fieldErrors.displayName}>
        {(field) => (
          <Input
            {...field}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            autoComplete="name"
          />
        )}
      </FormField>
      <FormField
        label={t('wprofile.bio')}
        required
        hint={t('wprofile.bioHint')}
        error={fieldErrors.bio}
      >
        {(field) => (
          <Textarea
            {...field}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={600}
          />
        )}
      </FormField>
      <FormField label={t('wprofile.years')} required error={fieldErrors.yearsExperience}>
        {(field) => (
          <Input
            {...field}
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            value={years}
            onChange={(e) => setYears(e.target.value)}
            className="w-32"
          />
        )}
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          {t('wprofile.languages')}{' '}
          <span className="text-danger-700" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => (
            <label key={code} className="flex min-h-11 items-center gap-2">
              <Checkbox
                checked={languages.includes(code)}
                onChange={(e) =>
                  setLanguages((l) =>
                    e.target.checked ? [...l, code] : l.filter((x) => x !== code),
                  )
                }
              />
              {languageNames([code], lang)}
            </label>
          ))}
        </div>
        {fieldErrors.languages && (
          <p className="text-sm text-danger-700" role="alert">
            {fieldErrors.languages}
          </p>
        )}
      </fieldset>

      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        loading={pending}
        loadingText={t('wprofile.saving')}
        className="self-start"
      >
        {t('wprofile.save')}
      </Button>
    </form>
  )
}
