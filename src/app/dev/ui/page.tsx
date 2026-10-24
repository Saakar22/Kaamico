import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo, LogoMark } from '@/components/brand/logo'
import {
  PriceLockedBadge,
  SimulationBadge,
  VerificationBadge,
} from '@/components/domain/trust-badges'
import { PageHeader } from '@/components/patterns/page-header'
import { StatTile } from '@/components/patterns/stat-tile'
import { EmptyState, ErrorState } from '@/components/patterns/states'
import { Stepper } from '@/components/patterns/stepper'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { brand } from '@/config/brand'
import { ButtonDemo, ChoiceDemo, FormDemo, OverlayDemo, TabsDemo } from './demos'

export const metadata: Metadata = { title: 'UI gallery' }

const swatches = [
  ['brand-600', 'bg-brand-600', 'Primary'],
  ['brand-700', 'bg-brand-700', 'Hover'],
  ['brand-50', 'bg-brand-50', 'Tint'],
  ['accent-500', 'bg-accent-500', 'Marigold'],
  ['ink-900', 'bg-ink-900', 'Text'],
  ['ink-600', 'bg-ink-600', 'Secondary text'],
  ['surface-muted', 'bg-surface-muted', 'Muted surface'],
  ['border', 'bg-border', 'Border'],
  ['success-700', 'bg-success-700', 'Success'],
  ['warning-700', 'bg-warning-700', 'Warning'],
  ['danger-700', 'bg-danger-700', 'Danger'],
  ['info-600', 'bg-info-600', 'Info'],
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export default function UiGalleryPage() {
  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-[1100px] flex-col gap-12 px-4 py-10 sm:px-6"
    >
      <PageHeader
        title="UI gallery"
        description="Kaamico design system primitives and patterns. Developer-only page."
        actions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/dev/shells/customer">Customer shell</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/dev/shells/worker">Worker shell</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/dev/shells/admin">Admin shell</Link>
            </Button>
          </>
        }
      />

      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-8">
          <Logo />
          <LogoMark className="size-12" />
          <div>
            <p className="font-display text-2xl font-bold">{brand.tagline}</p>
            <p className="text-ink-600">{brand.campaignLine}</p>
          </div>
        </div>
      </Section>

      <Section title="Colour">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {swatches.map(([token, bg, use]) => (
            <li key={token} className="flex flex-col gap-1.5">
              <span className={`${bg} h-14 rounded-md border border-border`} />
              <code className="text-xs">{token}</code>
              <span className="text-xs text-ink-600">{use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-2">
          <p className="font-display text-5xl font-bold">Display · Baloo 2</p>
          <p className="font-display text-3xl font-bold">Heading 3xl</p>
          <p className="text-xl font-semibold">Title xl · Inter</p>
          <p>
            Body 16px. Professionals set their own prices, and you can agree a fair price together.
          </p>
          <p className="text-sm text-ink-600">Secondary 14px</p>
          <p className="text-2xl font-semibold">
            Prices use tabular digits: <Money paise={10_000_000} /> · <Money paise={65_050} />
          </p>
        </div>
      </Section>

      <Section title="Buttons">
        <ButtonDemo />
      </Section>

      <Section title="Forms">
        <FormDemo />
      </Section>

      <Section title="Choices and tabs">
        <ChoiceDemo />
        <TabsDemo />
      </Section>

      <Section title="Overlays and feedback">
        <OverlayDemo />
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status="VERIFIED" />
          <VerificationBadge status="PENDING" />
          <PriceLockedBadge paise={65_000} />
          <SimulationBadge />
          <SimulationBadge label="Simulated payment" />
          <Badge tone="brand">New on Kaamico</Badge>
          <Badge tone="info">Scheduled</Badge>
          <Badge tone="warning">Expires in 8 min</Badge>
          <Badge tone="danger">Cancelled</Badge>
          <Badge>Draft</Badge>
        </div>
      </Section>

      <Section title="Cards and avatars">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar name="Rakesh Patil" />
                <div className="flex flex-col gap-1">
                  <CardTitle>Rakesh Patil</CardTitle>
                  <VerificationBadge status="VERIFIED" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>Plumber · 2.3 km away · ★ 4.7 (128)</CardDescription>
              <p className="mt-2 text-lg font-semibold">
                <Money paise={45_000} />{' '}
                <span className="text-sm font-normal text-ink-600">/ visit</span>
              </p>
            </CardContent>
            <CardFooter>
              <Button block>Book</Button>
            </CardFooter>
          </Card>
          <Card aria-hidden="true">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-11 w-full" />
            </CardContent>
          </Card>
        </div>
        <div className="flex items-center gap-3">
          <Avatar name="Priya Sharma" size="sm" />
          <Avatar name="Anil" size="md" />
          <Avatar name="Fatima Shaikh" size="lg" />
        </div>
      </Section>

      <Section title="Progress and stats">
        <Stepper steps={['Address', 'When', 'Details', 'Price', 'Review']} current={2} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="This week" value={<Money paise={812_000} />} hint="12 jobs" />
          <StatTile label="New requests" value="3" />
          <StatTile label="Rating" value="4.7" hint="128 reviews" />
          <StatTile label="Pending verifications" value="5" />
        </div>
      </Section>

      <Section title="Empty and error states">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <EmptyState
              title="No bookings yet"
              description="When you book a professional, it will show up here."
              action={<Button>Find a service</Button>}
            />
          </Card>
          <Card>
            <ErrorState
              title="Couldn't load your bookings"
              description="Check your connection and try again."
              reference="3f9c2a1e-demo"
              action={<Button variant="secondary">Try again</Button>}
            />
          </Card>
        </div>
      </Section>
    </main>
  )
}
