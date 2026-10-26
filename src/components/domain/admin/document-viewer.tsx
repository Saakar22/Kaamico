'use client'

import { Eye, FileText, ImageOff } from 'lucide-react'
import { useState } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api-client'
import { formatIstDateTime } from '@/lib/time'
import type { AdminDocument } from '@/modules/admin/verifications'

const DOC_LABELS: Record<string, string> = {
  AADHAAR_MASKED: 'Masked Aadhaar',
  PAN: 'PAN card',
  VOTER_ID: 'Voter ID',
  DRIVING_LICENCE: 'Driving licence',
  SELFIE: 'Selfie',
  SKILL_CERTIFICATE: 'Skill certificate',
  POLICE_VERIFICATION: 'Police verification',
}

export const docLabel = (type: string) => DOC_LABELS[type] ?? type

/**
 * Identity documents for review. Nothing loads until the admin asks: each "View" fetches
 * a 5-minute signed link, and the server records the view in the audit log.
 */
export function DocumentViewer({
  documents,
  profilePhotoUrl,
}: {
  documents: AdminDocument[]
  profilePhotoUrl: string | null
}) {
  const { pending, error, run } = useApiAction()
  const [open, setOpen] = useState<{ doc: AdminDocument; url: string } | null>(null)
  const [broken, setBroken] = useState(false)

  const view = (doc: AdminDocument) =>
    run(async () => {
      const { url } = await apiFetch<{ url: string }>(
        `/api/v1/admin/verification-documents/${doc.id}/url`,
      )
      setBroken(false)
      setOpen({ doc, url })
    })

  return (
    <section aria-labelledby="docs-title" className="flex flex-col gap-3">
      <h2 id="docs-title" className="font-semibold">
        Documents
      </h2>
      <p className="text-sm text-ink-600">Opening a document is recorded in the audit log.</p>
      <ul className="flex flex-col gap-2">
        {documents.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
          >
            <span className="flex flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {docLabel(d.docType)}
                {d.idLast4 && <span className="font-mono text-sm">•••• {d.idLast4}</span>}
                {d.isNew && <Badge tone="info">New since last review</Badge>}
              </span>
              <span className="text-xs text-ink-600">
                Uploaded {formatIstDateTime(new Date(d.uploadedAt))} ·{' '}
                {Math.max(1, Math.round(d.sizeBytes / 1024))} KB
                {d.purgeAfter &&
                  !d.purgedAt &&
                  ` · deleted after ${formatIstDateTime(new Date(d.purgeAfter))}`}
              </span>
            </span>
            {d.purgedAt ? (
              <Badge>Deleted (retention)</Badge>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => view(d)}
                disabled={pending}
                aria-label={`View ${docLabel(d.docType)}`}
              >
                <Eye aria-hidden="true" />
                View
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="text-sm text-danger-700" role="alert">
          {error}
        </p>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{docLabel(open.doc.docType)}</DialogTitle>
                <DialogDescription>
                  This link expires in 5 minutes. Do not download or share identity documents.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                {open.doc.mimeType === 'application/pdf' ? (
                  <a
                    href={open.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center gap-2 font-medium text-brand-700 hover:underline"
                  >
                    <FileText aria-hidden="true" className="size-5" />
                    Open the PDF in a new tab
                  </a>
                ) : broken ? (
                  <p className="flex items-center gap-2 rounded-md bg-surface-muted p-4 text-ink-600">
                    <ImageOff aria-hidden="true" className="size-5" />
                    The file is not available. Demo data has documents without files.
                  </p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived private link, not optimisable
                  <img
                    src={open.url}
                    alt={docLabel(open.doc.docType)}
                    className="max-h-[60dvh] w-full rounded-md object-contain"
                    onError={() => setBroken(true)}
                  />
                )}
                {open.doc.docType === 'SELFIE' && (
                  <figure className="flex flex-col gap-1">
                    {profilePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private admin-only photo
                      <img
                        src={profilePhotoUrl}
                        alt="Profile photo"
                        className="w-full rounded-md object-cover"
                      />
                    ) : (
                      <p className="rounded-md bg-surface-muted p-3 text-sm text-ink-600">
                        No profile photo
                      </p>
                    )}
                    <figcaption className="text-xs text-ink-600">
                      Profile photo, to compare
                    </figcaption>
                  </figure>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
