'use client'

import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'

/**
 * Supplementary hint on hover/focus. Never put essential information only in a
 * tooltip: touch users cannot hover.
 */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-64 rounded-md bg-ink-900 px-3 py-2 text-sm text-surface shadow-md"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-ink-900" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
