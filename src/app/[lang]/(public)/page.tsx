import { BadgeCheck, MessageSquareQuote, ShieldCheck, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { CategoryGrid } from '@/components/domain/catalog/category-card'
import { SearchBar } from '@/components/domain/catalog/search-bar'
import { Button } from '@/components/ui/button'
import { brand } from '@/config/brand'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { listCategories } from '@/modules/catalog/catalog'
import { listCities } from '@/modules/seo/cities'

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'home.step1Title', body: 'home.step1Body' },
  { title: 'home.step2Title', body: 'home.step2Body' },
  { title: 'home.step3Title', body: 'home.step3Body' },
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
    <div className="flex flex-col gap-16 sm:gap-24">
      {/*
        Hero. Phones: promise and search, then the rate list, then how pricing works.
        Desktop: promise and pricing steps on the left, the rate list beside them.
      */}
      <div className="grid gap-x-16 gap-y-14 pt-2 sm:pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-6" aria-labelledby="hero-title">
          <h1
            id="hero-title"
            className="font-display text-5xl leading-[0.95] font-semibold text-balance sm:text-6xl lg:text-7xl"
          >
            {t('brand.tagline')}
          </h1>
          <p className="max-w-[34rem] text-lg leading-relaxed text-ink-600">
            {t('brand.description')}
          </p>
          <SearchBar size="lg" className="max-w-xl" />
          <p className="font-display text-xl font-semibold text-brand-700">{brand.campaignLine}</p>
        </section>

        <section
          className="flex flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1"
          aria-labelledby="categories-title"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="categories-title" className="font-display text-2xl font-semibold">
              {t('home.categoriesTitle')}
            </h2>
            <Link
              href="/services"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
            >
              {t('home.allServices')}
            </Link>
          </div>
          <CategoryGrid categories={categories} />
        </section>

        <section
          className="flex flex-col gap-5 lg:col-start-1 lg:row-start-2"
          aria-labelledby="fair-pricing-title"
        >
          <h2 id="fair-pricing-title" className="font-display text-2xl font-semibold">
            {t('home.stepsTitle')}
          </h2>
          {/* A real sequence, so it is numbered. */}
          <ol className="flex max-w-xl flex-col gap-5 border-t border-ink-900 pt-5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3">
                <span
                  aria-hidden="true"
                  className="row-span-2 font-display text-4xl leading-none font-semibold text-brand-600 tabular-nums"
                >
                  {i + 1}
                </span>
                <h3 className="font-semibold">{t(step.title)}</h3>
                <p className="text-ink-600">{t(step.body)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-16">
        {cities.length > 0 && (
          <section aria-labelledby="cities-title" className="flex flex-col gap-4">
            <h2 id="cities-title" className="font-display text-2xl font-semibold">
              {t('home.citiesTitle')}
            </h2>
            <ul className="flex flex-col border-t border-border">
              {cities.map((c) => (
                <li key={c.slug} className="border-b border-border">
                  <Link
                    href={`/in/${c.slug}`}
                    className="flex min-h-12 items-baseline justify-between gap-3 py-3 hover:text-brand-700"
                  >
                    <span className="font-display text-xl font-semibold">{c.name}</span>
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
          <h2 id="trust-title" className="font-display text-2xl font-semibold">
            {t('home.trustTitle')}
          </h2>
          <ul className="grid gap-6 border-t border-border pt-4 sm:grid-cols-3">
            {TRUST.map((item) => (
              <li key={item.text} className="flex flex-col gap-3">
                <item.icon
                  aria-hidden="true"
                  className="size-6 text-success-700"
                  strokeWidth={1.75}
                />
                <span className="text-ink-900">{t(item.text)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section
        aria-labelledby="pros-title"
        className="flex flex-col items-start gap-6 rounded-lg bg-fill-brand p-6 text-on-fill sm:p-10 md:flex-row md:items-end md:justify-between"
      >
        <div className="flex max-w-xl flex-col gap-2">
          <h2 id="pros-title" className="font-display text-3xl font-semibold sm:text-4xl">
            {t('home.prosTitle')}
          </h2>
          <p className="text-lg text-on-fill">{t('home.prosBody')}</p>
        </div>
        <Button
          asChild
          size="lg"
          className="bg-surface text-brand-700 shadow-none hover:bg-brand-50 active:bg-brand-50"
        >
          <Link href="/login">{t('home.prosCta')}</Link>
        </Button>
      </section>
    </div>
  )
}
