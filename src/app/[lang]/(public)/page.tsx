import { BadgeCheck, Lock, MessageSquareQuote, ShieldCheck, type LucideIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { CategoryGrid } from '@/components/domain/catalog/category-card'
import { SearchBar } from '@/components/domain/catalog/search-bar'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
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

/**
 * An illustration of the negotiation, built from the product's own pieces: the listed
 * price, the customer's offer, the professional's final offer and the locked price.
 * Decorative (the numbered steps beside it say the same), so it is hidden from assistive tech.
 */
async function NegotiationExample() {
  const t = await getT()
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 rounded-xl bg-night p-5 text-on-night shadow-[var(--shadow-float)] sm:p-7"
    >
      <div className="flex items-baseline justify-between border-b border-white/10 pb-3 text-sm text-on-night-muted">
        <span>Tap repair · Kothrud</span>
        <span>
          {t('price.listed')} <Money paise={29000} className="font-semibold text-on-night" />
        </span>
      </div>
      <div className="ml-auto flex w-[78%] flex-col gap-1 rounded-lg rounded-br-sm bg-night-raised px-4 py-3">
        <span className="text-xs text-on-night-muted">{t('offer.yours')}</span>
        <Money paise={24000} className="font-display text-3xl font-semibold" />
      </div>
      <div className="flex w-[78%] flex-col gap-1 rounded-lg rounded-bl-sm bg-surface px-4 py-3 text-ink-900">
        <span className="flex items-center justify-between gap-2 text-xs text-ink-600">
          {t('offer.theirs', { name: 'Rakesh' })}
          <span className="rounded-sm bg-accent-100 px-1.5 py-0.5 font-semibold text-warning-800">
            {t('offer.final')}
          </span>
        </span>
        <Money paise={26500} className="font-display text-3xl font-semibold" />
      </div>
      <div className="mt-1 flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-3 font-semibold text-on-accent">
        <Lock className="size-4 shrink-0" />
        {t('thread.priceLocked')} <Money paise={26500} />
      </div>
    </div>
  )
}

export default async function HomePage() {
  const locale = await getLocale()
  const [categories, cities, t] = await Promise.all([listCategories(locale), listCities(), getT()])
  return (
    <div className="flex flex-col gap-20 sm:gap-28">
      {/* Hero: a real tradesperson at work, the promise, and search as the one thing to do. */}
      <section
        aria-labelledby="hero-title"
        className="relative -mx-4 -mt-6 overflow-hidden bg-night sm:mx-0 sm:mt-0 sm:rounded-xl"
      >
        {/* Phones: the photo sits above the text, uncovered. Wider: text overlays it. */}
        <div className="relative h-64 sm:h-80 md:absolute md:inset-0 md:h-auto">
          <Image
            src="/images/home/hero.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1200px) 1152px, 100vw"
            className="object-cover object-[70%_25%]"
          />
          {/* Scrim: a soft fade into the text panel, clear over the craftsman's face. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-night to-transparent to-40% md:bg-gradient-to-r md:from-night md:from-30% md:via-night/55 md:via-55% md:to-transparent md:to-100%"
          />
        </div>
        <div className="relative flex flex-col gap-6 px-5 pb-8 sm:px-10 sm:pb-12 md:min-h-[38rem] md:max-w-[40rem] md:justify-center md:py-12 lg:px-14">
          <h1
            id="hero-title"
            className="font-display text-5xl leading-[0.95] font-semibold text-balance text-on-night sm:text-6xl lg:text-7xl"
          >
            {t('brand.tagline')}
          </h1>
          <p className="max-w-[32rem] text-lg leading-relaxed text-on-night-muted">
            {t('brand.description')}
          </p>
          <SearchBar size="hero" className="max-w-xl" />
          <p className="font-display text-xl font-semibold text-accent-500">{brand.campaignLine}</p>
        </div>
      </section>

      <section className="flex flex-col gap-6" aria-labelledby="categories-title">
        <div className="flex items-end justify-between gap-4">
          <h2 id="categories-title" className="font-display text-3xl font-semibold sm:text-4xl">
            {t('home.categoriesTitle')}
          </h2>
          <Link
            href="/services"
            className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
          >
            {t('home.allServices')}
          </Link>
        </div>
        <CategoryGrid categories={categories} />
      </section>

      <section
        aria-labelledby="fair-pricing-title"
        className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20"
      >
        <div className="flex flex-col gap-8">
          <h2 id="fair-pricing-title" className="font-display text-3xl font-semibold sm:text-4xl">
            {t('home.stepsTitle')}
          </h2>
          {/* A real sequence, so it is numbered. */}
          <ol className="flex flex-col gap-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4">
                <span
                  aria-hidden="true"
                  className="row-span-2 flex size-12 items-center justify-center rounded-lg bg-mist font-display text-2xl font-semibold text-brand-700 tabular-nums"
                >
                  {i + 1}
                </span>
                <h3 className="pt-0.5 text-lg font-semibold">{t(step.title)}</h3>
                <p className="max-w-[36rem] text-ink-600">{t(step.body)}</p>
              </li>
            ))}
          </ol>
        </div>
        <NegotiationExample />
      </section>

      <section
        aria-labelledby="trust-title"
        className="flex flex-col gap-8 rounded-xl bg-mist p-6 sm:p-10"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="trust-title" className="font-display text-3xl font-semibold">
            {t('home.trustTitle')}
          </h2>
          {cities.length > 0 && (
            <nav aria-labelledby="cities-title" className="flex flex-col gap-2 sm:items-end">
              <h3 id="cities-title" className="text-sm text-ink-600">
                {t('home.citiesTitle')}
              </h3>
              <ul className="flex flex-wrap gap-2">
                {cities.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/in/${c.slug}`}
                      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-4 shadow-[var(--shadow-lift)] hover:text-brand-700"
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-sm text-ink-600">
                        {t(c.localities.length === 1 ? 'home.areaOne' : 'home.areaOther', {
                          count: c.localities.length,
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <ul className="grid gap-8 border-t border-brand-600/15 pt-8 md:grid-cols-3">
          {TRUST.map((item) => (
            <li key={item.text} className="flex gap-4 md:flex-col">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface shadow-[var(--shadow-lift)]">
                <item.icon
                  aria-hidden="true"
                  className="size-6 text-brand-700"
                  strokeWidth={1.75}
                />
              </span>
              <span className="text-lg leading-snug font-medium text-ink-900">{t(item.text)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="pros-title"
        className="grid overflow-hidden rounded-xl bg-night text-on-night md:grid-cols-2"
      >
        <div className="relative min-h-64 md:min-h-[26rem]">
          <Image
            src="/images/home/professionals.jpg"
            alt=""
            fill
            sizes="(min-width: 768px) 576px, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col items-start justify-center gap-5 p-6 sm:p-10 lg:p-14">
          <h2 id="pros-title" className="font-display text-4xl font-semibold sm:text-5xl">
            {t('home.prosTitle')}
          </h2>
          <p className="max-w-md text-lg text-on-night-muted">{t('home.prosBody')}</p>
          <Button asChild size="lg" variant="accent">
            <Link href="/login">{t('home.prosCta')}</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
