'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/client'

export function PrintButton() {
  const t = useT()
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      {t('receipt.print')}
    </Button>
  )
}
