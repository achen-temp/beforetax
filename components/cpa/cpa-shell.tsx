import type { ReactNode } from 'react'
import Link from 'next/link'
import { PortalFirmMark } from '@/components/client/portal-firm-mark'
import { CpaNav } from '@/components/cpa/cpa-nav'
import { UserMenu } from '@/components/cpa/user-menu'
import { SiteFooter } from '@/components/site-footer'
import type { CpaUserRole } from '@/types'

/** Shared chrome for CPA pages — firm logo/name (same mark as client portal). */
export function CpaShell({
  user,
  children,
}: {
  user: {
    email: string
    firmName: string | null
    logoUrl: string | null
    role: CpaUserRole
    firstName: string | null
    lastName: string | null
  }
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fb]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <Link href="/clients" className="min-w-0 shrink">
              <PortalFirmMark
                firmName={user.firmName}
                logoUrl={user.logoUrl}
                iconClassName="size-8 text-xs"
                textClassName="text-base"
              />
            </Link>
            <CpaNav />
          </div>
          <UserMenu
            email={user.email}
            firmName={user.firmName}
            role={user.role}
            firstName={user.firstName}
            lastName={user.lastName}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">{children}</main>

      <SiteFooter maxWidthClass="max-w-6xl" poweredBy />
    </div>
  )
}
