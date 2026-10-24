import { AdminShell } from '@/components/layout/shells'
import { SampleContent } from '../sample-content'

export const metadata = { title: 'Admin shell' }

export default function AdminShellPreview() {
  return (
    <AdminShell>
      <SampleContent title="Admin shell" />
    </AdminShell>
  )
}
