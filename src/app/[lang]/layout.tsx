import type { Metadata, Viewport } from 'next'
import { Baloo_2, Inter, Noto_Sans_Devanagari } from 'next/font/google'
import { Suspense } from 'react'
import { DemoBanner } from '@/components/layout/demo-banner'
import { PwaSetup } from '@/components/pwa/pwa-setup'
import { THEME_SCRIPT } from '@/components/pwa/theme'
import { Toaster } from '@/components/ui/toaster'
import { brand } from '@/config/brand'
import { I18nProvider } from '@/i18n/client'
import { htmlLang, LOCALES } from '@/i18n/config'
import { getLocale, getT, messagesFor } from '@/i18n/server'
import '../globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const baloo = Baloo_2({
  variable: '--font-baloo',
  subsets: ['latin'],
  weight: ['600', '700'],
})

// Hindi headings. Not preloaded: English pages never use these glyphs.
const balooDevanagari = Baloo_2({
  variable: '--font-baloo-devanagari',
  subsets: ['devanagari'],
  weight: ['600', '700'],
  preload: false,
})

// Hindi body text; Inter has no Devanagari. Not preloaded: English pages never use it.
const devanagari = Noto_Sans_Devanagari({
  variable: '--font-devanagari',
  subsets: ['devanagari'],
  preload: false,
})

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }))
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = await getT()
  return {
    title: {
      default: `${brand.name} — ${t('brand.tagline')}`,
      template: `%s · ${brand.name}`,
    },
    description: t('brand.description'),
    applicationName: brand.name,
    // Absolute canonical and Open Graph URLs; the server's own env check validates APP_URL.
    metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
    openGraph: {
      siteName: brand.name,
      locale: htmlLang[locale].replace('-', '_'),
      type: 'website',
    },
  }
}

export const viewport: Viewport = {
  // The browser bar matches the page: brand green in light, the dark surface in dark.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0b6e4f' },
    { media: '(prefers-color-scheme: dark)', color: '#121417' },
  ],
}

export default async function RootLayout({ children }: LayoutProps<'/[lang]'>) {
  const locale = await getLocale()
  return (
    // data-theme is set by THEME_SCRIPT before React hydrates, so the server's <html> differs.
    <html
      lang={htmlLang[locale]}
      className={`${inter.variable} ${baloo.variable} ${balooDevanagari.variable} ${devanagari.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a chosen Light/Dark theme before the first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <I18nProvider locale={locale} messages={messagesFor(locale)}>
          <Suspense fallback={null}>
            <DemoBanner />
          </Suspense>
          {children}
          <Toaster />
          <PwaSetup />
        </I18nProvider>
      </body>
    </html>
  )
}
