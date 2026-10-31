'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from '@/components/ui/toaster'
import { useErrorMessage, useT } from '@/i18n/client'
import { ApiError } from '@/lib/api-client'

type Issue = { path: string; message: string }

/**
 * Runs an API call for a form: tracks pending state, maps validation issues onto
 * fields, refreshes server data on success and confirms with a toast.
 */
export function useApiAction() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const t = useT()
  const errorMessage = useErrorMessage()

  async function run<T>(
    action: () => Promise<T>,
    options: { success?: string; refresh?: boolean } = {},
  ): Promise<T | undefined> {
    setPending(true)
    setError(undefined)
    setFieldErrors({})
    try {
      const result = await action()
      if (options.success) toast.success(options.success)
      if (options.refresh !== false) router.refresh()
      return result
    } catch (e) {
      if (e instanceof ApiError) {
        const issues = (e.details?.issues as Issue[] | undefined) ?? []
        setFieldErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])))
        setError(issues.length > 0 ? t('errors.fixFields') : errorMessage(e))
      } else {
        setError(errorMessage(e))
      }
      return undefined
    } finally {
      setPending(false)
    }
  }

  return { pending, error, fieldErrors, run, setError }
}

/** Uploads one file to private storage and returns its upload id. */
export async function uploadFile(
  file: File,
  purpose: 'VERIFICATION_DOCUMENT' | 'PROFILE_PHOTO',
): Promise<string> {
  const form = new FormData()
  form.set('file', file)
  form.set('purpose', purpose)
  let response: Response
  try {
    response = await fetch('/api/v1/uploads', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'Could not reach Kaamico. Check your connection and try again.',
    )
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'INTERNAL',
      data?.error?.message ?? 'The upload failed. Please try again.',
      data?.error?.details,
      data?.error?.requestId,
    )
  }
  return data.uploadId as string
}
