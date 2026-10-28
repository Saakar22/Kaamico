import type { Metadata, Viewport } from 'next'
import { Baloo_2, Inter } from 'next/font/google'
import { Suspense } from 'react'
import { DemoBanner } from '@/components/layout/demo-banner'
import { PwaSetup } from '@/components/pwa/pwa-setup'
import { THEME_SCRIPT } from '@/components/pwa/theme'
import { Toaster } from '@/components/ui/toaster'
import { brand } from '@/config/brand'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

const baloo = Baloo_2({
  variable: '--font-baloo',
  subsets: ['latin'],
  weight: ['600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  applicationName: brand.name,
  // Absolute canonical and Open Graph URLs; the server's own env check validates APP_URL.
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  openGraph: { siteName: brand.name, locale: 'en_IN', type: 'website' },
}

export const viewport: Viewport = {
  // The browser bar matches the page: brand green in light, the dark surface in dark.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0b6e4f' },
    { media: '(prefers-color-scheme: dark)', color: '#121417' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // data-theme is set by THEME_SCRIPT before React hydrates, so the server's <html> differs.
    <html
      lang="en-IN"
      className={`${inter.variable} ${baloo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies a chosen Light/Dark theme before the first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
        {children}
        <Toaster />
        <PwaSetup />
      </body>
    </html>
  )
}
