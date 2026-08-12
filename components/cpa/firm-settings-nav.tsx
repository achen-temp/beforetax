'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Building2, Upload } from 'lucide-react'

const NAV = [
  {
    href: '/settings/profile',
    label: 'Profile',
    match: (p: string) => p === '/settings/profile' || p === '/settings',
    Icon: Building2,
  },
  {
    href: '/settings/checklist',
    label: 'Tax prep checklist',
    match: (p: string) => p.startsWith('/settings/checklist'),
    Icon: ClipboardList,
  },
  {
    href: '/settings/uploads',
    label: 'Uploads',
    match: (p: string) => p.startsWith('/settings/uploads'),
    Icon: Upload,
  },
] as const

export function FirmSettingsNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm md:flex-col md:overflow-visible">
      {NAV.map((item) => {
        const active = item.match(pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-blue-50 text-[#0061FF]'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <item.Icon className="size-4 shrink-0 opacity-70" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
