'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/dialog'
import { SidebarNav } from './nav'

export function AdminMobileMenu() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // Close after navigating.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="tertiary" size="icon" aria-label="Open menu">
          <Menu aria-hidden="true" className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined}>
        <SheetTitle>Admin</SheetTitle>
        <SidebarNav nav="admin" label="Admin" />
      </SheetContent>
    </Sheet>
  )
}
