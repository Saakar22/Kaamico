import { brand } from '@/config/brand'

// Placeholder home page for Phase 1. The real homepage is built in Phase 5.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
      <p className="font-display text-2xl font-bold text-brand-600">{brand.wordmark}</p>
      <h1 className="font-display text-4xl leading-tight font-bold sm:text-5xl">{brand.tagline}</h1>
      <p className="max-w-prose text-lg text-ink-600">{brand.description}</p>
      <p className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm text-ink-600">
        Kaamico is under construction. Booking is not available yet.
      </p>
    </main>
  )
}
