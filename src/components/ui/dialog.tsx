'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

function Overlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-overlay/50 motion-reduce:animate-none" />
  )
}

function CloseButton() {
  return (
    <DialogPrimitive.Close
      className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md text-ink-600 hover:bg-surface-muted hover:text-ink-900"
      aria-label="Close"
    >
      <X aria-hidden="true" className="size-5" />
    </DialogPrimitive.Close>
  )
}

/** Centred modal. Use for confirmations and short focused tasks. */
export function DialogContent({
  className,
  children,
  hideClose,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-pop-in flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-5 shadow-lg motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && <CloseButton />}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

const sheetVariants = cva(
  'bg-surface fixed z-50 flex flex-col gap-4 overflow-y-auto p-5 shadow-lg motion-reduce:animate-none',
  {
    variants: {
      side: {
        bottom:
          'animate-slide-up inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg pb-[max(1.25rem,env(safe-area-inset-bottom))]',
        right: 'animate-slide-in-right inset-y-0 right-0 w-[min(24rem,calc(100vw-3rem))]',
        left: 'animate-slide-in-left inset-y-0 left-0 w-[min(20rem,calc(100vw-3rem))]',
      },
    },
    defaultVariants: { side: 'bottom' },
  },
)

/** Edge-anchored panel: bottom sheet on phones, side panel on larger screens. */
export function SheetContent({
  className,
  children,
  side,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {side === 'bottom' || side == null ? (
          <div aria-hidden="true" className="mx-auto -mt-1 h-1.5 w-12 rounded-full bg-border" />
        ) : null}
        {children}
        <CloseButton />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-10', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-ink-600', className)} {...props} />
}

export const Sheet = Dialog
export const SheetTrigger = DialogTrigger
export const SheetClose = DialogClose
export const SheetHeader = DialogHeader
export const SheetFooter = DialogFooter
export const SheetTitle = DialogTitle
export const SheetDescription = DialogDescription
