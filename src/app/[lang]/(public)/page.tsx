import {
  BadgeCheck,
  BriefcaseBusiness,
  Handshake,
  IndianRupee,
  Lock,
  MessageSquareQuote,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { CategoryGrid } from '@/components/domain/catalog/category-card'
import { SearchBar } from '@/components/domain/catalog/search-bar'
import { Button } from '@/components/ui/button'
import { brand } from '@/config/brand'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { listCategories } from '@/modules/catalog/catalog'
import { listCities } from '@/modules/seo/cities'

const STEPS: { icon: LucideIcon; title: MessageKey; body: MessageKey }[] = [
  { icon: IndianRupee, title: 'home.step1Title', body: 'home.step1Body' },
  { icon: Handshake, title: 'home.step2Title', body: 'home.step2Body' },
  { icon: Lock, title: 'home.step3Title', body: 'home.step3Body' },
]

const TRUST: { icon: LucideIcon; text: MessageKey }[] = [
  { icon: BadgeCheck, text: 'home.trust1' },
  { icon: MessageSquareQuote, text: 'home.trust2' },
  { icon: ShieldCheck, text: 'home.trust3' },
]

export default async function HomePage() {
  const locale = await getLocale()
  const [categories, cities, t] = await Promise.all([listCategories(locale), listCities(), getT()])
  return (
    <div className="flex flex-col gap-12 sm:gap-16">
      <section className="flex flex-col gap-5 pt-2 sm:pt-8" aria-labelledby="hero-title">
        <p className="font-display text-lg font-semibold text-brand-700">{brand.campaignLine}</p>
        <h1 id="hero-title" className="font-display text-4xl leading-tight font-bold sm:text-5xl">
          {t('brand.tagline')}
        </h1>
        <p className="max-w-prose text-lg text-ink-600">{t('brand.description')}</p>
        <SearchBar size="lg" className="max-w-2xl" />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="categories-title">
        <div className="flex items-end justify-between gap-4">
          <h2 id="categories-title" className="font-display text-2xl font-bold">
            {t('home.categoriesTitle')}
          </h2>
          <Link href="/services" className="text-sm font-medium text-brand-700 hover:underline">
            {t('home.allServices')}
          </Link>
        </div>
        <CategoryGrid categories={categories} />
      </section>

      <section
        className="flex flex-col gap-6 rounded-lg bg-surface-muted p-5 sm:p-8"
        aria-labelledby="fair-pricing-title"
      >
        <h2 id="fair-pricing-title" className="font-display text-2xl font-bold">
          {t('home.stepsTitle')}
        </h2>
        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-brand font-semibold text-on-fill">
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 font-semibold">
                  <step.icon aria-hidden="true" className="size-5 text-brand-700" />
                  {t(step.title)}
                </h3>
                <p className="text-ink-600">{t(step.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {cities.length > 0 && (
        <section aria-labelledby="cities-title" className="flex flex-col gap-3">
          <h2 id="cities-title" className="font-display text-2xl font-bold">
            {t('home.citiesTitle')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/in/${c.slug}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 hover:border-brand-600"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-sm text-ink-600">
                    {t(c.localities.length === 1 ? 'home.areaOne' : 'home.areaOther', {
                      count: c.localities.length,
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="trust-title" className="flex flex-col gap-4">
        <h2 id="trust-title" className="font-display text-2xl font-bold">
          {t('home.trustTitle')}
        </h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {TRUST.map((item) => (
            <li
              key={item.text}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <item.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-700" />
              <span>{t(item.text)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="pros-title"
        className="flex flex-col items-start gap-3 rounded-lg border border-brand-600/30 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="flex flex-col gap-1">
          <h2 id="pros-title" className="flex items-center gap-2 text-xl font-bold">
            <BriefcaseBusiness aria-hidden="true" className="size-6 text-brand-700" />
            {t('home.prosTitle')}
          </h2>
          <p className="text-ink-600">{t('home.prosBody')}</p>
        </div>
        <Button asChild>
          <Link href="/login">{t('home.prosCta')}</Link>
        </Button>
      </section>
    </div>
  )
}
