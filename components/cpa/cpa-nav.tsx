'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/clients', label: 'Clients', match: (p: string) => p === '/clients' || p.startsWith('/clients/') },
  {
    href: '/admin/field-catalog',
    label: 'Field catalog',
    match: (p: string) => p.startsWith('/admin/field-catalog'),
  },
  { href: '/settings', label: 'Settings', match: (p: string) => p === '/settings' || p.startsWith('/settings/') },
]

/** Header tabs for the CPA shell — highlights the route currently on screen. */
export function CpaNav() {
  const pathname = usePathname()

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV_LINKS.map((link) => {
        const active = link.match(pathname)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-blue-50 text-[#0061FF]'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
