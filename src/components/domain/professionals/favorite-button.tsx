'use client'

import { Heart } from 'lucide-react'
import { useState } from 'react'
import { useApiAction } from '@/components/domain/worker/use-api-action'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/client'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'

/** Save or unsave a professional; a toggle button announced as pressed or not. */
export function FavoriteButton({ workerId, initial }: { workerId: string; initial: boolean }) {
  const { pending, run } = useApiAction()
  const [saved, setSaved] = useState(initial)
  const t = useT()

  const toggle = () =>
    run(
      async () => {
        const next = !saved
        await apiFetch(`/api/v1/favorites/${workerId}`, { method: next ? 'PUT' : 'DELETE' })
        setSaved(next)
      },
      { success: saved ? t('favorites.removed') : t('favorites.saved'), refresh: false },
    )

  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={saved}
      onClick={toggle}
      disabled={pending}
      className="w-fit"
    >
      <Heart aria-hidden="true" className={cn(saved && 'fill-current')} />
      {saved ? t('favorites.saved') : t('favorites.save')}
    </Button>
  )
}
