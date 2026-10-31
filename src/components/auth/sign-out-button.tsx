'use client'

import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { toast } from '@/components/ui/toaster'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import { hardNavigate } from '@/lib/navigate'

export function SignOutButton({
  redirectTo = '/login',
  ...props
}: { redirectTo?: string } & Omit<ButtonProps, 'onClick' | 'loading'>) {
  const t = useT()
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="secondary"
      loading={pending}
      loadingText={t('account.signingOut')}
      onClick={async () => {
        setPending(true)
        try {
          await apiFetch('/api/v1/auth/logout', { body: {} })
        } catch {
          setPending(false)
          toast.error(t('account.signOutFailed'))
          return
        }
        await hardNavigate(redirectTo)
      }}
      {...props}
    >
      <LogOut aria-hidden="true" />
      {t('account.signOut')}
    </Button>
  )
}
