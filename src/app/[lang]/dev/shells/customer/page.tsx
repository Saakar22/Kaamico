import { CustomerShell } from '@/components/layout/shells'
import { SampleContent } from '../sample-content'

export const metadata = { title: 'Customer shell' }

export default function CustomerShellPreview() {
  return (
    <CustomerShell>
      <SampleContent title="Customer shell" />
    </CustomerShell>
  )
}
