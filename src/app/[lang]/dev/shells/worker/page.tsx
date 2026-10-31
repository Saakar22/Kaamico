import { WorkerShell } from '@/components/layout/shells'
import { SampleContent } from '../sample-content'

export const metadata = { title: 'Worker shell' }

export default function WorkerShellPreview() {
  return (
    <WorkerShell>
      <SampleContent title="Worker shell" />
    </WorkerShell>
  )
}
