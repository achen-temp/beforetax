import Link from 'next/link'
import { PLATFORM_NAME } from '@/lib/brand'

/** Shared legal/copyright footer used across marketing, CPA, and portal shells. */
export function SiteFooter({ maxWidthClass = 'max-w-7xl' }: { maxWidthClass?: string }) {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div
        className={`mx-auto flex w-full ${maxWidthClass} flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-slate-400 sm:flex-row lg:px-8`}
      >
        <nav className="flex items-center gap-5">
          <Link href="/privacy" className="hover:text-slate-600">
            Privacy
          </Link>
          <Link href="/security" className="hover:text-slate-600">
            Security
          </Link>
          <Link href="/terms" className="hover:text-slate-600">
            Terms
          </Link>
        </nav>
        <p>
          © {new Date().getFullYear()} {PLATFORM_NAME}
        </p>
      </div>
    </footer>
  )
}
