import {
  AirVent,
  Bug,
  ChefHat,
  Drill,
  Hammer,
  House,
  PaintRoller,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

const ICONS: Record<string, LucideIcon> = {
  wrench: Wrench,
  zap: Zap,
  hammer: Hammer,
  'paint-roller': PaintRoller,
  sparkles: Sparkles,
  'chef-hat': ChefHat,
  house: House,
  'air-vent': AirVent,
  bug: Bug,
  drill: Drill,
}

/** Keys an admin can choose for a category. */
export const CATEGORY_ICON_KEYS = Object.keys(ICONS)

/** Category icon in a tinted circle. Unknown keys fall back to a wrench. */
export function CategoryIcon({ iconKey, className }: { iconKey: string; className?: string }) {
  const Icon = ICONS[iconKey] ?? Wrench
  return (
    <span
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-6" strokeWidth={1.75} />
    </span>
  )
}
