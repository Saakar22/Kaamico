import Image from 'next/image'
import { cn } from '@/lib/cn'
import { CategoryIcon } from './category-icon'

/** Categories with a photo in public/images/categories (see public/images/CREDITS.md). */
const PHOTOS = new Set([
  'plumbing',
  'electrical',
  'carpentry',
  'painting',
  'cleaning',
  'cooking',
  'house-help',
  'appliance-repair',
  'pest-control',
  'handyman',
])

export function categoryPhoto(slug: string): string | null {
  return PHOTOS.has(slug) ? `/images/categories/${slug}.jpg` : null
}

/**
 * A category's photo filling its (positioned, sized) parent. Categories without a photo
 * get a neem tile with the category icon, so new categories still look intentional.
 * Decorative: the category name is always shown next to it.
 */
export function CategoryImage({
  slug,
  iconKey,
  sizes,
  priority = false,
  className,
}: {
  slug: string
  iconKey: string
  /** The rendered width, for responsive image selection, e.g. "(min-width: 1024px) 240px, 45vw". */
  sizes: string
  priority?: boolean
  className?: string
}) {
  const src = categoryPhoto(slug)
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={cn('absolute inset-0 flex items-center justify-center bg-night', className)}
      >
        <CategoryIcon iconKey={iconKey} plain className="size-10 text-on-night-muted" />
      </span>
    )
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      priority={priority}
      className={cn('object-cover', className)}
    />
  )
}
