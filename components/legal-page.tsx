import type { ReactNode } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/brand-logo'
import { PLATFORM_NAME } from '@/lib/brand'

/** Shared shell for the static legal/info pages (Privacy, Security, Terms) so they
 * match the landing page's header/footer chrome. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fb]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5 lg:px-8">
          <Link href="/">
            <BrandLogo />
          </Link>
          <Link
            href="/"
            className="text-sm text-slate-500 underline-offset-4 hover:underline"
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-slate-600">
          {children}
        </div>
      </main>

      <footer className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-6 py-6 text-sm text-slate-400 lg:px-8">
          <nav className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
            <Link href="/security" className="hover:text-slate-600">Security</Link>
            <Link href="/terms" className="hover:text-slate-600">Terms</Link>
          </nav>
          <p>© {new Date().getFullYear()} {PLATFORM_NAME}</p>
        </div>
      </footer>
    </div>
  )
}
