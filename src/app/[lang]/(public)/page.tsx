import Image from 'next/image'
import Link from 'next/link'
import { CategoryGrid } from '@/components/domain/catalog/category-card'
import { FairPricingDemo } from '@/components/domain/negotiation/fair-pricing-demo'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/ui/money'
import { brand } from '@/config/brand'
import { getLocale, getT } from '@/i18n/server'
import type { MessageKey } from '@/i18n/translate'
import { listCategories } from '@/modules/catalog/catalog'
import { listCities } from '@/modules/seo/cities'

const TRUST: MessageKey[] = ['home.trust1', 'home.trust2', 'home.trust3']

/** The category the hero photo shows, so its caption can carry a real price. */
const HERO_CATEGORY = 'electrical'

/** Section heading, shared so every section opens the same way. */
function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-display text-3xl leading-tight font-semibold sm:text-[2.5rem]">
      {children}
    </h2>
  )
}

export default async function HomePage() {
  const locale = await getLocale()
  const [categories, cities, t] = await Promise.all([listCategories(locale), listCities(), getT()])
  const heroCategory = categories.find((c) => c.slug === HERO_CATEGORY)
  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      {/* Hero: the promise on the left (search is in the header above); a professional at work on the right. */}
      <section
        aria-labelledby="hero-title"
        className="grid items-center gap-10 pt-2 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-16"
      >
        <div className="flex flex-col gap-7">
          <h1
            id="hero-title"
            className="font-display text-[3.25rem] leading-[0.95] font-semibold text-balance sm:text-7xl lg:text-[5.25rem]"
          >
            {t('brand.tagline')}
          </h1>
          <p className="max-w-[34rem] text-lg leading-relaxed text-ink-600">
            {t('brand.description')}
          </p>
          <p className="font-display text-lg text-ink-600">{brand.campaignLine}</p>
        </div>
        <figure className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-muted sm:aspect-[5/4] lg:aspect-[4/5]">
            <Image
              src="/images/home/hero.jpg"
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 432px, 100vw"
              className="object-cover object-[22%_50%] photo-grade"
            />
          </div>
          {heroCategory && heroCategory.referenceFromPaise !== null && (
            <figcaption className="absolute bottom-4 left-4">
              <Link
                href={`/services/${heroCategory.slug}`}
                className="flex flex-col rounded-lg bg-surface px-4 py-3 shadow-[var(--shadow-float)] hover:text-brand-700"
              >
                <span className="font-semibold">{heroCategory.name}</span>
                <span className="text-sm text-ink-600">
                  {t('catalog.typicallyFrom')}{' '}
                  <Money
                    paise={heroCategory.referenceFromPaise}
                    className="font-semibold text-ink-900"
                  />
                </span>
              </Link>
            </figcaption>
          )}
        </figure>
      </section>

      <section className="flex flex-col gap-8" aria-labelledby="categories-title">
        <div className="flex items-end justify-between gap-4">
          <SectionTitle id="categories-title">{t('home.categoriesTitle')}</SectionTitle>
          <Link
            href="/services"
            className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-brand-700 underline underline-offset-4 hover:no-underline"
          >
            {t('home.allServices')}
          </Link>
        </div>
        <CategoryGrid categories={categories} />
      </section>

      <section
        aria-labelledby="fair-pricing-title"
        className="flex flex-col gap-8 border-t border-border pt-12 sm:pt-16"
      >
        <SectionTitle id="fair-pricing-title">{t('home.stepsTitle')}</SectionTitle>
        <FairPricingDemo />
      </section>

      <section
        aria-labelledby="trust-title"
        className="flex flex-col gap-10 border-t border-border pt-12 sm:pt-16"
      >
        <SectionTitle id="trust-title">{t('home.trustTitle')}</SectionTitle>
        <ul className="grid gap-x-10 gap-y-6 md:grid-cols-3">
          {TRUST.map((text) => (
            <li
              key={text}
              className="border-l-2 border-brand-600 pl-4 text-lg leading-snug font-medium text-ink-900"
            >
              {t(text)}
            </li>
          ))}
        </ul>
        {cities.length > 0 && (
          <nav
            aria-labelledby="cities-title"
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8"
          >
            <h3 id="cities-title" className="text-sm text-ink-600">
              {t('home.citiesTitle')}
            </h3>
            <ul className="flex flex-wrap gap-x-8 gap-y-2">
              {cities.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/in/${c.slug}`}
                    className="inline-flex min-h-11 items-baseline gap-2 underline-offset-4 hover:text-brand-700 hover:underline"
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
          </nav>
        )}
      </section>

      <section
        aria-labelledby="pros-title"
        className="grid items-center gap-10 border-t border-border pt-12 sm:pt-16 md:grid-cols-2 lg:gap-20"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-muted md:aspect-[5/4]">
          <Image
            src="/images/home/professionals.jpg"
            alt=""
            fill
            sizes="(min-width: 768px) 560px, 100vw"
            className="object-cover object-[50%_25%] photo-grade"
          />
        </div>
        <div className="flex flex-col items-start gap-5">
          <SectionTitle id="pros-title">{t('home.prosTitle')}</SectionTitle>
          <p className="max-w-md text-lg text-ink-600">{t('home.prosBody')}</p>
          <Button asChild size="lg">
            <Link href="/login">{t('home.prosCta')}</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
