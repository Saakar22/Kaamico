'use client'

import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ComponentProps,
  type Ref,
} from 'react'
import { cn } from '@/lib/cn'

// 16px text on all controls prevents iOS from zooming on focus.
export const controlClasses =
  'w-full rounded-md border border-border bg-surface px-3 text-base text-ink-900 shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150 placeholder:text-ink-600/70 hover:border-ink-600/40 focus-visible:border-brand-600 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 aria-invalid:border-danger-700 motion-reduce:transition-none'

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/**
 * On a slow connection people type (or pick) before React has loaded, and React keeps
 * what is on screen but not in state, so the form would submit an empty value. Once
 * hydrated, a controlled field reports a value the browser already holds as a change.
 */
function useKeepEarlyInput<T extends Field>(
  value: unknown,
  onChange: ((event: ChangeEvent<T>) => void) | undefined,
  ref: Ref<T> | undefined,
) {
  const own = useRef<T>(null)
  const latest = useRef({ value, onChange })
  useLayoutEffect(() => {
    latest.current = { value, onChange }
  })
  // A layout effect runs in the hydration commit, before React replays a click (e.g.
  // "Send code") the person made while the page was loading.
  useLayoutEffect(() => {
    const el = own.current
    const { value: initial, onChange: report } = latest.current
    if (!el || initial === undefined || !report || el.value === String(initial)) return
    report({ target: el, currentTarget: el } as ChangeEvent<T>)
  }, [])
  useImperativeHandle(ref, () => own.current!, [])
  return own
}

export function Input({ className, type = 'text', ref, ...props }: ComponentProps<'input'>) {
  const own = useKeepEarlyInput(props.value, props.onChange, ref)
  return (
    <input ref={own} type={type} className={cn(controlClasses, 'h-11', className)} {...props} />
  )
}

export function Textarea({ className, rows = 4, ref, ...props }: ComponentProps<'textarea'>) {
  const own = useKeepEarlyInput(props.value, props.onChange, ref)
  return (
    <textarea
      ref={own}
      rows={rows}
      className={cn(controlClasses, 'py-2.5', className)}
      {...props}
    />
  )
}

/** Native select: best keyboard, screen-reader and mobile picker support. */
export function NativeSelect({ className, children, ref, ...props }: ComponentProps<'select'>) {
  const own = useKeepEarlyInput(props.value, props.onChange, ref)
  return (
    <select ref={own} className={cn(controlClasses, 'h-11 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn('size-6 shrink-0 rounded-sm accent-brand-600', className)}
      {...props}
    />
  )
}
