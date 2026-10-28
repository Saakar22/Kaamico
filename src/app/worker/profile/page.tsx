import type { Metadata } from 'next'
import Link from 'next/link'
import { ProfileForm } from '@/components/domain/worker/profile-form'
import { SkillsForm } from '@/components/domain/worker/skills-form'
import { PageHeader } from '@/components/patterns/page-header'
import { AppSettings } from '@/components/pwa/app-settings'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { listCategories } from '@/modules/catalog/catalog'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getOwnProfile } from '@/modules/workers/profile'

export const instant = false

export const metadata: Metadata = { title: 'Your profile' }

export default async function WorkerProfilePage() {
  const actor = await requireWorkerPage()
  const [profile, categories] = await Promise.all([getOwnProfile(actor.workerId), listCategories()])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your profile"
        description="This is what customers see when they compare professionals."
        actions={
          profile.verificationStatus === 'VERIFIED' ? (
            <Link
              href={`/professionals/${profile.workerId}`}
              className="text-sm font-medium text-brand-700 underline"
            >
              View public profile
            </Link>
          ) : undefined
        }
      />
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">About you</h2>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initial={{
              displayName: profile.displayName,
              bio: profile.bio,
              yearsExperience: profile.yearsExperience,
              languages: profile.languages,
              hasPhoto: profile.hasPhoto,
            }}
          />
        </CardContent>
      </Card>
      <Card id="skills" className="scroll-mt-20">
        <CardHeader>
          <h2 className="text-lg font-semibold">Your skills</h2>
        </CardHeader>
        <CardContent>
          <SkillsForm
            categories={categories.map((c) => ({ id: c.id, name: c.name, iconKey: c.iconKey }))}
            initial={profile.categoryIds}
          />
        </CardContent>
      </Card>
      <AppSettings />
    </div>
  )
}
