'use client'

import { Avatar as AvatarPrimitive } from 'radix-ui'
import { cn } from '@/lib/cn'

const sizes = { sm: 'size-8 text-xs', md: 'size-12 text-sm', lg: 'size-20 text-xl' } as const

/** Initials tiles take one of a few brand tints, chosen from the name so it stays stable. */
const TINTS = [
  'bg-brand-50 text-brand-700',
  'bg-accent-100 text-warning-800',
  'bg-info-600/10 text-info-600',
  'bg-mist text-ink-900',
] as const

function tintFor(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[hash % TINTS.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** Photo with an initials fallback. The name is used as the accessible label. */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string
  src?: string | null
  size?: keyof typeof sizes
  className?: string
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden rounded-full font-semibold',
        tintFor(name),
        sizes[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center"
        role="img"
        aria-label={name}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
