'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Collapse once scrolled past this; expand again only near the top (no flicker in between). */
const COLLAPSE_AT = 40
const EXPAND_AT = 8

/**
 * The public pages' header. At the top it is tall: the main bar, a large search and the
 * category tabs. Scrolling down collapses it to the main bar; from `xl` the large search
 * shrinks away and a compact search grows into the bar, below `xl` (no room in the bar)
 * the large search stays. Back near the top it expands again.
 *
 * The header is fixed over a spacer of its expanded height, so collapsing it never moves
 * the page. Scroll state is written to `data-collapsed` on the header (read in rAF, no
 * React state), and every change is a CSS transition keyed on it.
 */
export function DiscoveryHeader({
  bar,
  compactSearch,
  search,
  categories,
}: {
  /** The main bar's contents: logo and location on the left, navigation on the right. */
  bar: { start: ReactNode; end: ReactNode }
  compactSearch: ReactNode
  search: ReactNode
  categories: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const header = ref.current
    if (!header) return
    let collapsed = false
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      const next = collapsed ? y > EXPAND_AT : y > COLLAPSE_AT
      if (next === collapsed) return
      collapsed = next
      header.dataset.collapsed = String(next)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <>
      <header
        ref={ref}
        data-collapsed="false"
        className="group/header fixed inset-x-0 top-0 z-30 border-b border-border bg-surface"
      >
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          {/* Main bar */}
          <div className="flex h-16 items-center gap-3">
            {bar.start}
            <div className="hidden min-w-0 flex-1 justify-center xl:flex">
              <div className="invisible w-full max-w-sm origin-top translate-y-8 scale-125 opacity-0 transition-[opacity,scale,translate,visibility] duration-300 ease-out group-data-[collapsed=true]/header:visible group-data-[collapsed=true]/header:translate-y-0 group-data-[collapsed=true]/header:scale-100 group-data-[collapsed=true]/header:opacity-100 motion-reduce:transition-none">
                {compactSearch}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1 xl:ml-0">{bar.end}</div>
          </div>

          {/* Large search: collapses away from xl, where the compact one takes over. */}
          <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none xl:group-data-[collapsed=true]/header:grid-rows-[0fr]">
            <div className="min-h-0 overflow-hidden">
              <div className="flex h-[60px] origin-top items-start justify-center pt-1 transition-[opacity,scale,translate,visibility] duration-300 ease-out motion-reduce:transition-none xl:h-[84px] xl:pt-2 xl:group-data-[collapsed=true]/header:invisible xl:group-data-[collapsed=true]/header:-translate-y-10 xl:group-data-[collapsed=true]/header:scale-x-75 xl:group-data-[collapsed=true]/header:scale-y-50 xl:group-data-[collapsed=true]/header:opacity-0">
                {search}
              </div>
            </div>
          </div>

          {/* Category tabs: fold up and fade on every screen size. */}
          <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-out group-data-[collapsed=true]/header:grid-rows-[0fr] motion-reduce:transition-none">
            <div className="min-h-0 overflow-hidden">
              <div className="h-14 transition-[opacity,translate,visibility] duration-300 ease-out group-data-[collapsed=true]/header:invisible group-data-[collapsed=true]/header:-translate-y-3 group-data-[collapsed=true]/header:opacity-0 motion-reduce:transition-none">
                {categories}
              </div>
            </div>
          </div>
        </div>
      </header>
      {/* Holds the expanded header's height: 64 bar + search row + 56 tabs + 1 border. */}
      <div aria-hidden="true" className="h-[181px] shrink-0 xl:h-[205px]" />
    </>
  )
}
