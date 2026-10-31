'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { ApiError, apiFetch } from '@/lib/api-client'
import { hardNavigate } from '@/lib/navigate'

export function AdminLoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(undefined)
    try {
      const result = await apiFetch<{ redirectTo: string }>('/api/v1/auth/admin/login', {
        body: { email, password, next },
      })
      await hardNavigate(result.redirectTo)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <FormField label="Email">
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
      <FormField label="Password" error={error}>
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </FormField>
      <Button
        type="submit"
        size="lg"
        block
        loading={pending}
        loadingText="Signing in…"
        disabled={!email || !password}
      >
        Sign in
      </Button>
      <Link href="/admin/forgot-password" className="text-sm font-medium text-brand-700 underline">
        Forgot password?
      </Link>
    </form>
  )
}
