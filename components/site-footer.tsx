import Link from 'next/link'
import { PLATFORM_NAME } from '@/lib/brand'

/** Shared legal/copyright footer. On portal pages set poweredBy so the platform
 * credit sits bottom-right in low-contrast type (firm brand stays primary). */
export function SiteFooter({
  maxWidthClass = 'max-w-7xl',
  poweredBy = false,
}: {
  maxWidthClass?: string
  poweredBy?: boolean
}) {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div
        className={`mx-auto flex w-full ${maxWidthClass} flex-col items-center justify-between gap-3 px-6 py-5 text-sm text-slate-400 sm:flex-row lg:px-8`}
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
        <div className="flex flex-col items-center gap-0.5 text-right sm:items-end">
          {poweredBy ? (
            <p className="text-[11px] tracking-wide text-slate-300">
              Powered by {PLATFORM_NAME}
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} {PLATFORM_NAME}
            </p>
          )}
        </div>
      </div>
    </footer>
  )
}
