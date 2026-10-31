'use client'

import { CircleCheck, Circle, FileText, ImageIcon, ShieldCheck, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, NativeSelect } from '@/components/ui/input'
import { useLocale, useT } from '@/i18n/client'
import { htmlLang } from '@/i18n/config'
import type { MessageKey } from '@/i18n/translate'
import { apiFetch } from '@/lib/api-client'
import { formatIstDateTime } from '@/lib/time'
import type { VerificationState } from '@/modules/verification/verification'
import { uploadFile, useApiAction } from './use-api-action'

const DOC_LABELS: Record<string, MessageKey> = {
  AADHAAR_MASKED: 'wverify.docAadhaar',
  PAN: 'wverify.docPan',
  VOTER_ID: 'wverify.docVoter',
  DRIVING_LICENCE: 'wverify.docLicence',
  SELFIE: 'wverify.docSelfie',
  SKILL_CERTIFICATE: 'wverify.docSkill',
  POLICE_VERIFICATION: 'wverify.docPolice',
}
const ID_TYPES = ['AADHAAR_MASKED', 'PAN', 'VOTER_ID', 'DRIVING_LICENCE']

const REQUIREMENT_LABELS: Record<string, { label: MessageKey; href?: string }> = {
  profile: { label: 'wverify.reqProfile', href: '/worker/profile' },
  skills: { label: 'wverify.reqSkills', href: '/worker/profile#skills' },
  area: { label: 'wverify.reqArea', href: '/worker/availability#area' },
  idDocument: { label: 'wverify.reqId' },
  selfie: { label: 'wverify.reqSelfie' },
}

const MAX_BYTES = { image: 5 * 1024 * 1024, pdf: 8 * 1024 * 1024 }

export function VerificationPanel({ state }: { state: VerificationState }) {
  const t = useT()
  const lang = htmlLang[useLocale()]
  const docLabel = (type: string) => (DOC_LABELS[type] ? t(DOC_LABELS[type]) : type)
  const { pending, error, fieldErrors, run, setError } = useApiAction()
  const [docType, setDocType] = useState('AADHAAR_MASKED')
  const [last4, setLast4] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  // One key per submit attempt, so a double-tap cannot submit twice.
  const [submitKey] = useState(() => crypto.randomUUID())
  const isId = ID_TYPES.includes(docType)

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!file) return
    const limit = file.type === 'application/pdf' ? MAX_BYTES.pdf : MAX_BYTES.image
    if (file.size > limit) {
      setError(t('wverify.tooLarge', { mb: limit / 1024 / 1024 }))
      return
    }
    return run(
      async () => {
        const uploadId = await uploadFile(file, 'VERIFICATION_DOCUMENT')
        await apiFetch('/api/v1/worker/verification/documents', {
          body: { uploadId, docType, idLast4: isId ? last4 : undefined },
        })
        setFile(null)
        setLast4('')
        setFileKey((k) => k + 1)
      },
      { success: t('wverify.added', { doc: docLabel(docType) }) },
    )
  }

  const remove = (id: string) =>
    run(() => apiFetch(`/api/v1/worker/verification/documents/${id}`, { method: 'DELETE' }), {
      success: t('wverify.removed'),
    })

  const submit = () =>
    run(
      () => apiFetch('/api/v1/worker/verification/submit', { body: {}, idempotencyKey: submitKey }),
      { success: t('wverify.sent') },
    )

  return (
    <div className="flex flex-col gap-6">
      {state.documents.length > 0 && (
        <section aria-labelledby="docs-title" className="flex flex-col gap-3">
          <h2 id="docs-title" className="text-lg font-semibold">
            {t('wverify.yourDocs')}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {state.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 p-3">
                <span className="flex items-center gap-3">
                  {d.mimeType === 'application/pdf' ? (
                    <FileText aria-hidden="true" className="size-5 text-ink-600" />
                  ) : (
                    <ImageIcon aria-hidden="true" className="size-5 text-ink-600" />
                  )}
                  <span>
                    <span className="block font-medium">
                      {docLabel(d.docType)}
                      {d.idLast4 && (
                        <span className="text-ink-600">
                          {t('wverify.ending', { last4: d.idLast4 })}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-ink-600">
                      {t('wverify.addedOn', {
                        date: formatIstDateTime(new Date(d.uploadedAt), lang),
                      })}
                    </span>
                  </span>
                </span>
                {state.canEdit && d.isNew && (
                  <Button
                    variant="tertiary"
                    size="icon"
                    aria-label={t('wverify.remove', { doc: docLabel(d.docType) })}
                    onClick={() => remove(d.id)}
                    disabled={pending}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.canEdit && (
        <section
          aria-labelledby="add-title"
          className="flex flex-col gap-4 rounded-lg border border-border p-4"
        >
          <h2 id="add-title" className="text-lg font-semibold">
            {t('wverify.addDoc')}
          </h2>
          <form onSubmit={add} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('wverify.docType')} required error={fieldErrors.docType}>
                {(field) => (
                  <NativeSelect
                    {...field}
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  >
                    {Object.keys(DOC_LABELS).map((value) => (
                      <option key={value} value={value}>
                        {docLabel(value)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              {isId && (
                <FormField
                  label={t('wverify.last4')}
                  required
                  hint={t('wverify.last4Hint')}
                  error={fieldErrors.idLast4}
                >
                  {(field) => (
                    <Input
                      {...field}
                      value={last4}
                      onChange={(e) => setLast4(e.target.value.toUpperCase().slice(0, 4))}
                      maxLength={4}
                      autoComplete="off"
                      className="w-32 font-mono tracking-widest uppercase"
                    />
                  )}
                </FormField>
              )}
            </div>
            <FormField
              label={docType === 'SELFIE' ? t('wverify.selfiePhoto') : t('wverify.docFile')}
              required
              hint={
                docType === 'AADHAAR_MASKED'
                  ? t('wverify.aadhaarHint')
                  : docType === 'SELFIE'
                    ? t('wverify.selfieHint')
                    : t('wverify.fileHint')
              }
            >
              {(field) => (
                <Input
                  {...field}
                  key={fileKey}
                  type="file"
                  accept={
                    docType === 'SELFIE'
                      ? 'image/jpeg,image/png,image/webp'
                      : 'image/jpeg,image/png,image/webp,application/pdf'
                  }
                  capture={docType === 'SELFIE' ? 'user' : undefined}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="h-auto py-2"
                />
              )}
            </FormField>
            <Button
              type="submit"
              variant="secondary"
              loading={pending}
              loadingText={t('wverify.uploading')}
              disabled={!file || (isId && last4.length !== 4)}
              className="self-start"
            >
              <Upload aria-hidden="true" />
              {t('wverify.upload')}
            </Button>
          </form>
        </section>
      )}

      {state.canEdit && (
        <section aria-labelledby="checklist-title" className="flex flex-col gap-3">
          <h2 id="checklist-title" className="text-lg font-semibold">
            {t('wverify.beforeSubmit')}
          </h2>
          <ul className="flex flex-col gap-2">
            {state.requirements.map((r) => {
              const meta = REQUIREMENT_LABELS[r.key]
              return (
                <li key={r.key} className="flex items-center gap-2">
                  {r.done ? (
                    <CircleCheck aria-hidden="true" className="size-5 text-success-700" />
                  ) : (
                    <Circle aria-hidden="true" className="size-5 text-ink-600" />
                  )}
                  <span className="sr-only">{r.done ? t('wverify.done') : t('wverify.todo')}</span>
                  {meta.href && !r.done ? (
                    <Link href={meta.href} className="text-brand-700 underline">
                      {t(meta.label)}
                    </Link>
                  ) : (
                    t(meta.label)
                  )}
                </li>
              )
            })}
          </ul>
          {error && (
            <p className="text-sm text-danger-700" role="alert">
              {error}
            </p>
          )}
          <Button
            onClick={submit}
            loading={pending}
            loadingText={t('wverify.submitting')}
            disabled={!state.canSubmit}
            className="self-start"
          >
            <ShieldCheck aria-hidden="true" />
            {t('wverify.submit')}
          </Button>
        </section>
      )}
      {!state.canEdit && error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
