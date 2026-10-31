'use client'

import { Ban } from 'lucide-react'
import { useState } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'

/** Block a professional, after a confirmation that says what blocking does. */
export function BlockButton({ workerId, name }: { workerId: string; name: string }) {
  const t = useT()
  const { pending, error, run } = useApiAction()
  const [open, setOpen] = useState(false)

  const block = () =>
    run(
      async () => {
        await apiFetch(`/api/v1/blocks/${workerId}`, { method: 'PUT' })
        setOpen(false)
      },
      { success: t('blocks.blocked', { name }) },
    )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="tertiary" size="sm" className="w-fit">
          <Ban aria-hidden="true" />
          {t('blocks.block')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('blocks.confirmTitle', { name })}</DialogTitle>
          <DialogDescription>{t('blocks.confirmBody')}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t('blocks.cancel')}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={block}
            loading={pending}
            loadingText={t('blocks.blocking')}
          >
            {t('blocks.block')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UnblockButton({ workerId, name }: { workerId: string; name: string }) {
  const t = useT()
  const { pending, run } = useApiAction()
  return (
    <Button
      variant="secondary"
      size="sm"
      className="w-fit"
      loading={pending}
      loadingText={t('blocks.unblocking')}
      aria-label={t('blocks.unblockName', { name })}
      onClick={() =>
        run(() => apiFetch(`/api/v1/blocks/${workerId}`, { method: 'DELETE' }), {
          success: t('blocks.unblocked', { name }),
        })
      }
    >
      {t('blocks.unblock')}
    </Button>
  )
}
