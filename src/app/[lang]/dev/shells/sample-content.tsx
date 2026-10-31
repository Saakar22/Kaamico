import { PageHeader } from '@/components/patterns/page-header'
import { StatTile } from '@/components/patterns/stat-tile'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function SampleContent({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description="Shell preview with placeholder content." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active" value="2" />
        <StatTile label="Upcoming" value="5" />
        <StatTile label="Completed" value="41" />
        <StatTile label="Cancelled" value="1" />
      </div>
      <Card>
        <EmptyState
          title="Nothing needs your attention"
          description="Navigation links point at routes that are built in later phases."
          action={<Button variant="secondary">Primary action</Button>}
        />
      </Card>
    </div>
  )
}
