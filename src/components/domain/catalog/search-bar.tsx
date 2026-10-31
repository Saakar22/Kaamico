import { Search } from 'lucide-react'
import { getT } from '@/i18n/server'
import { cn } from '@/lib/cn'

/** Plain GET form to /search: works before JavaScript loads. */
export async function SearchBar({
  defaultValue,
  className,
  size = 'md',
}: {
  defaultValue?: string
  className?: string
  /** `hero`: a floating white panel for photo backgrounds (home page). */
  size?: 'md' | 'lg' | 'hero'
}) {
  const hero = size === 'hero'
  const t = await getT()
  return (
    <form
      action="/search"
      role="search"
      className={cn(
        'flex w-full gap-2',
        hero && 'rounded-xl bg-surface p-2 shadow-[var(--shadow-float)]',
        className,
      )}
    >
      <label htmlFor="service-search" className="sr-only">
        {t('search.label')}
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-600',
            hero && 'left-4',
          )}
        />
        <input
          id="service-search"
          name="q"
          type="search"
          defaultValue={defaultValue}
          required
          minLength={2}
          maxLength={60}
          placeholder={t('search.placeholder')}
          className={cn(
            'w-full rounded-md border border-border bg-surface pr-3 pl-10 text-base text-ink-900 placeholder:text-ink-600/80',
            size === 'lg' ? 'h-12' : 'h-11',
            hero && 'h-13 border-transparent pl-12 sm:text-lg',
          )}
        />
      </div>
      <button
        type="submit"
        className={cn(
          'inline-flex shrink-0 items-center rounded-md bg-fill-brand px-4 font-semibold text-on-fill transition-colors hover:bg-fill-brand-hover motion-reduce:transition-none',
          size === 'lg' ? 'h-12 px-5' : 'h-11',
          hero && 'h-13 rounded-lg px-6 text-base',
        )}
      >
        {t('search.submit')}
      </button>
    </form>
  )
}
