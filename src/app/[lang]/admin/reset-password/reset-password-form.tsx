'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ApiError, apiFetch } from '@/lib/api-client'

type Issue = { path: string; message: string }

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <p role="alert">
        This link is incomplete.{' '}
        <Link href="/admin/forgot-password" className="font-medium text-brand-700 underline">
          Ask for a new one
        </Link>
        .
      </p>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status">Your password is changed.</p>
        <Button asChild size="lg" block>
          <Link href="/admin/login">Sign in</Link>
        </Button>
      </div>
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setPending(true)
    setError(undefined)
    try {
      await apiFetch('/api/v1/auth/admin/reset-password', { body: { token, password } })
      setDone(true)
    } catch (e) {
      const issue = e instanceof ApiError ? (e.details?.issues as Issue[] | undefined)?.[0] : null
      setError(
        issue?.message ??
          (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <FormField label="New password">
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        )}
      </FormField>
      <FormField label="Type it again" error={error}>
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
      </FormField>
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        loadingText="Saving…"
        disabled={!password || !confirm}
      >
        Save new password
      </Button>
    </form>
  )
}
