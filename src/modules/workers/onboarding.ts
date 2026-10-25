import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'

export type OnboardingStepKey = 'profile' | 'skills' | 'area' | 'pricing' | 'hours' | 'verification'

export type OnboardingStep = {
  key: OnboardingStepKey
  title: string
  description: string
  href: string
  done: boolean
}

export type OnboardingState = {
  steps: OnboardingStep[]
  completed: number
  /** First unfinished step: where "Continue setup" goes. */
  next: OnboardingStep | null
  verificationStatus: string
}

/** The setup checklist (IMPLEMENTATION_PLAN.md §5.2): resumes at the first incomplete step. */
export async function getOnboardingState(workerId: string): Promise<OnboardingState> {
  const [row] = await getDb().execute<{
    profile: boolean
    skills: boolean
    area: boolean
    pricing: boolean
    hours: boolean
    submitted: boolean
    verification_status: string
  }>(sql`
    select (w.bio is not null and cardinality(w.languages) > 0) as profile,
           exists (select 1 from worker_skills s where s.worker_id = w.id) as skills,
           (w.base_lat is not null) as area,
           exists (select 1 from worker_service_pricing p where p.worker_id = w.id and p.is_active) as pricing,
           exists (select 1 from worker_availability_rules r where r.worker_id = w.id) as hours,
           (w.verification_status in ('PENDING', 'VERIFIED')) as submitted,
           w.verification_status
    from worker_profiles w where w.id = ${workerId}`)

  const steps: OnboardingStep[] = [
    {
      key: 'profile',
      title: 'Your profile',
      description: 'Name, a short introduction, experience and languages',
      href: '/worker/profile',
      done: row.profile,
    },
    {
      key: 'skills',
      title: 'Your skills',
      description: 'The kinds of work you do',
      href: '/worker/profile#skills',
      done: row.skills,
    },
    {
      key: 'area',
      title: 'Where you work',
      description: 'Your base area and how far you travel',
      href: '/worker/availability#area',
      done: row.area,
    },
    {
      key: 'pricing',
      title: 'Your prices',
      description: 'Set your own price for each service',
      href: '/worker/pricing',
      done: row.pricing,
    },
    {
      key: 'hours',
      title: 'Working hours',
      description: 'When customers can book you',
      href: '/worker/availability#hours',
      done: row.hours,
    },
    {
      key: 'verification',
      title: 'ID verification',
      description: 'Upload your ID and a selfie for review',
      href: '/worker/verification',
      done: row.submitted,
    },
  ]
  return {
    steps,
    completed: steps.filter((s) => s.done).length,
    next: steps.find((s) => !s.done) ?? null,
    verificationStatus: row.verification_status,
  }
}
