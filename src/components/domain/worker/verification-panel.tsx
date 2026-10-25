'use client'

import { CircleCheck, Circle, FileText, ImageIcon, ShieldCheck, Trash2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input, NativeSelect } from '@/components/ui/input'
import { apiFetch } from '@/lib/api-client'
import { formatIstDateTime } from '@/lib/time'
import type { VerificationState } from '@/modules/verification/verification'
import { uploadFile, useApiAction } from './use-api-action'

const DOC_LABELS: Record<string, string> = {
  AADHAAR_MASKED: 'Masked Aadhaar',
  PAN: 'PAN card',
  VOTER_ID: 'Voter ID',
  DRIVING_LICENCE: 'Driving licence',
  SELFIE: 'Selfie',
  SKILL_CERTIFICATE: 'Skill certificate',
  POLICE_VERIFICATION: 'Police verification',
}
const ID_TYPES = ['AADHAAR_MASKED', 'PAN', 'VOTER_ID', 'DRIVING_LICENCE']

const REQUIREMENT_LABELS: Record<string, { label: string; href?: string }> = {
  profile: { label: 'Profile with a short introduction and languages', href: '/worker/profile' },
  skills: { label: 'At least one skill', href: '/worker/profile#skills' },
  area: { label: 'Your work area', href: '/worker/availability#area' },
  idDocument: { label: 'An ID document' },
  selfie: { label: 'A selfie' },
}

const MAX_BYTES = { image: 5 * 1024 * 1024, pdf: 8 * 1024 * 1024 }

export function VerificationPanel({ state }: { state: VerificationState }) {
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
      setError(`This file is too large (max ${limit / 1024 / 1024} MB).`)
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
      { success: `${DOC_LABELS[docType]} added` },
    )
  }

  const remove = (id: string) =>
    run(() => apiFetch(`/api/v1/worker/verification/documents/${id}`, { method: 'DELETE' }), {
      success: 'Document removed',
    })

  const submit = () =>
    run(
      () => apiFetch('/api/v1/worker/verification/submit', { body: {}, idempotencyKey: submitKey }),
      { success: 'Sent for review' },
    )

  return (
    <div className="flex flex-col gap-6">
      {state.documents.length > 0 && (
        <section aria-labelledby="docs-title" className="flex flex-col gap-3">
          <h2 id="docs-title" className="text-lg font-semibold">
            Your documents
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
                      {DOC_LABELS[d.docType]}
                      {d.idLast4 && <span className="text-ink-600"> ending {d.idLast4}</span>}
                    </span>
                    <span className="text-sm text-ink-600">
                      Added {formatIstDateTime(new Date(d.uploadedAt))}
                    </span>
                  </span>
                </span>
                {state.canEdit && d.isNew && (
                  <Button
                    variant="tertiary"
                    size="icon"
                    aria-label={`Remove ${DOC_LABELS[d.docType]}`}
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
            Add a document
          </h2>
          <form onSubmit={add} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Document type" required error={fieldErrors.docType}>
                {(field) => (
                  <NativeSelect
                    {...field}
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                  >
                    {Object.entries(DOC_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              {isId && (
                <FormField
                  label="Last 4 characters of the ID number"
                  required
                  hint="Only the last 4. Never type your full Aadhaar number."
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
              label={docType === 'SELFIE' ? 'Selfie photo' : 'Photo or PDF of the document'}
              required
              hint={
                docType === 'AADHAAR_MASKED'
                  ? 'Use the masked Aadhaar (only the last 4 digits visible), downloadable from the UIDAI website. JPEG, PNG, WebP or PDF, up to 8 MB.'
                  : docType === 'SELFIE'
                    ? 'A clear photo of your face. JPEG, PNG or WebP, up to 5 MB.'
                    : 'JPEG, PNG or WebP up to 5 MB, or PDF up to 8 MB.'
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
              loadingText="Uploading…"
              disabled={!file || (isId && last4.length !== 4)}
              className="self-start"
            >
              <Upload aria-hidden="true" />
              Upload document
            </Button>
          </form>
        </section>
      )}

      {state.canEdit && (
        <section aria-labelledby="checklist-title" className="flex flex-col gap-3">
          <h2 id="checklist-title" className="text-lg font-semibold">
            Before you submit
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
                  <span className="sr-only">{r.done ? 'Done:' : 'To do:'}</span>
                  {meta.href && !r.done ? (
                    <Link href={meta.href} className="text-brand-700 underline">
                      {meta.label}
                    </Link>
                  ) : (
                    meta.label
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
            loadingText="Submitting…"
            disabled={!state.canSubmit}
            className="self-start"
          >
            <ShieldCheck aria-hidden="true" />
            Submit for review
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
