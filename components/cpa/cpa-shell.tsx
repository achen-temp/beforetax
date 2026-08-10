import type { ReactNode } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { CpaNav } from '@/components/cpa/cpa-nav'
import { UserMenu } from '@/components/cpa/user-menu'
import { SiteFooter } from '@/components/site-footer'

/** Shared chrome for CPA-facing pages so they match the customer-facing pages'
 * header/footer (BrandLogo + nav + profile menu on top, legal links + copyright
 * on the bottom). */
export function CpaShell({
  user,
  children,
}: {
  user: { email: string; firmName: string | null }
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fb]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/clients">
              <BrandLogo />
            </Link>
            <CpaNav />
          </div>
          <UserMenu email={user.email} firmName={user.firmName} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 lg:px-8">{children}</main>

      <SiteFooter maxWidthClass="max-w-6xl" />
    </div>
  )
}
