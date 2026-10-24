import { SearchX } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/patterns/states'

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={SearchX}
        title="We couldn't find that page"
        description="The link may be broken, or the page may have moved."
        action={
          <Button asChild>
            <Link href="/">Go to home</Link>
          </Button>
        }
      />
    </main>
  )
}
