import { Search } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Plain GET form to /search: works before JavaScript loads. */
export function SearchBar({
  defaultValue,
  className,
  size = 'md',
}: {
  defaultValue?: string
  className?: string
  size?: 'md' | 'lg'
}) {
  return (
    <form action="/search" role="search" className={cn('flex w-full gap-2', className)}>
      <label htmlFor="service-search" className="sr-only">
        What do you need help with?
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-600"
        />
        <input
          id="service-search"
          name="q"
          type="search"
          defaultValue={defaultValue}
          required
          minLength={2}
          maxLength={60}
          placeholder="Try “plumber”, “AC service” or “nal”"
          className={cn(
            'w-full rounded-md border border-border bg-surface pr-3 pl-10 text-base text-ink-900 placeholder:text-ink-600/80',
            size === 'lg' ? 'h-12' : 'h-11',
          )}
        />
      </div>
      <button
        type="submit"
        className={cn(
          'inline-flex shrink-0 items-center rounded-md bg-fill-brand px-4 font-medium text-on-fill hover:bg-fill-brand-hover',
          size === 'lg' ? 'h-12 px-5' : 'h-11',
        )}
      >
        Search
      </button>
    </form>
  )
}
