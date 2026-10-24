'use client'

import { Toaster as SonnerToaster } from 'sonner'

export { toast } from 'sonner'

/** Mounted once in the root layout. Toasts confirm actions; they never carry the only copy of an error. */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-md border border-border bg-surface text-ink-900 shadow-md font-sans',
          description: 'text-ink-600',
          success: '[&_[data-icon]]:text-success-700',
          error: '[&_[data-icon]]:text-danger-700',
        },
      }}
    />
  )
}
