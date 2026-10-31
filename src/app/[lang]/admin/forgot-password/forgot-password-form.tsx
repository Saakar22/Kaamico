'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ApiError, apiFetch } from '@/lib/api-client'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(undefined)
    try {
      await apiFetch('/api/v1/auth/admin/forgot-password', { body: { email } })
      setSent(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status">
          If that address has an admin account, a reset link is on its way. It works once, for 30
          minutes.
        </p>
        <Link href="/admin/login" className="font-medium text-brand-700 underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <FormField label="Email" error={error}>
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        )}
      </FormField>
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        loadingText="Sending…"
        disabled={!email}
      >
        Send reset link
      </Button>
      <Link href="/admin/login" className="text-sm font-medium text-brand-700 underline">
        Back to sign in
      </Link>
    </form>
  )
}
