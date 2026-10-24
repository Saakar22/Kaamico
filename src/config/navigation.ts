import {
  BriefcaseBusiness,
  CalendarCheck,
  ClipboardList,
  FolderTree,
  House,
  Inbox,
  LayoutDashboard,
  ScrollText,
  Search,
  ShieldCheck,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** Also active on nested paths (e.g. /bookings/123). Defaults to true except for "/". */
  matchNested?: boolean
}

// Routes are defined in IMPLEMENTATION_PLAN.md §5; most are built in later phases.

export const customerNav: NavItem[] = [
  { href: '/', label: 'Home', icon: House, matchNested: false },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/bookings', label: 'Bookings', icon: CalendarCheck },
  { href: '/profile', label: 'Account', icon: User },
]

export const workerNav: NavItem[] = [
  { href: '/worker/dashboard', label: 'Home', icon: House },
  { href: '/worker/requests', label: 'Requests', icon: Inbox },
  { href: '/worker/bookings', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/worker/earnings', label: 'Earnings', icon: Wallet },
]

export const adminNav: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, matchNested: false },
  { href: '/admin/verifications', label: 'Verifications', icon: ShieldCheck },
  { href: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/categories', label: 'Categories', icon: FolderTree },
  { href: '/admin/audit-logs', label: 'Audit log', icon: ScrollText },
]

// Server components pass a key, not the items: icon components cannot cross the
// server → client boundary as props.
export const navigations = { customer: customerNav, worker: workerNav, admin: adminNav }
export type NavKey = keyof typeof navigations

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchNested === false) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
