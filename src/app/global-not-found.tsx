import type { Metadata } from 'next'
import { Anek_Latin, Inter, Noto_Sans_Devanagari } from 'next/font/google'
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { THEME_SCRIPT } from '@/components/pwa/theme'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
const anek = Anek_Latin({ variable: '--font-anek', subsets: ['latin'], axes: ['wdth'] })
const devanagari = Noto_Sans_Devanagari({
  variable: '--font-devanagari',
  subsets: ['devanagari'],
  preload: false,
})

export const metadata: Metadata = { title: 'Page not found · Kaamico' }

/**
 * URLs no route matches. The root layout lives under `[lang]`, so this page renders its
 * own document; it cannot know the visitor's language and says it in both.
 */
export default function GlobalNotFound() {
  return (
    <html
      lang="en-IN"
      className={`${inter.variable} ${anek.variable} ${devanagari.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <main
          id="main-content"
          className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center"
        >
          <Logo />
          <h1 className="font-display text-2xl font-semibold">We couldn&apos;t find that page</h1>
          <p className="max-w-sm text-ink-600">
            The link may be broken, or the page may have moved.
          </p>
          <p lang="hi-IN" className="max-w-sm text-ink-600">
            यह पेज नहीं मिला। लिंक ग़लत हो सकता है या पेज हटा दिया गया हो।
          </p>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-md bg-fill-brand px-4 font-medium text-on-fill hover:bg-fill-brand-hover"
          >
            Go to home · होम पर जाएँ
          </Link>
        </main>
      </body>
    </html>
  )
}
