import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = { title: 'Reset admin password', robots: { index: false } }

export default function AdminForgotPasswordPage() {
  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center bg-surface-muted px-4 py-10 sm:justify-center"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-col gap-2">
          <Logo />
          <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
          <p className="text-sm text-ink-600">
            Enter your admin email. If it has an admin account, we&apos;ll send a link to choose a
            new password.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  )
}
