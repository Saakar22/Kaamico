import type { ReactNode } from 'react'
import { PageHeader } from '@/components/patterns/page-header'
import { getT } from '@/i18n/server'

/** Long-form policy text with a visible draft notice until a lawyer has reviewed it. */
export async function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  const t = await getT()
  // Policies are not translated (a lawyer reviews the English); Hindi readers are told so.
  const englishOnly = t('pages.englishOnly')
  return (
    <article className="flex max-w-prose flex-col gap-5">
      {englishOnly && (
        <p role="note" lang="hi-IN" className="rounded-md bg-surface-muted px-3 py-2 text-sm">
          {englishOnly}
        </p>
      )}
      <PageHeader title={title} description={`Last updated ${updated}`} />
      <p
        role="note"
        className="rounded-md border border-warning-700/30 bg-warning-700/10 px-3 py-2 text-sm text-ink-900"
      >
        Draft for legal review. This describes how Kaamico works today; it is not yet final.
      </p>
      <div className="flex flex-col gap-4 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
        {children}
      </div>
    </article>
  )
}
