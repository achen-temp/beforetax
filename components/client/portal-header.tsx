'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, FileSpreadsheet, UploadCloud, UserRound } from 'lucide-react'
import { PortalFirmMark } from '@/components/client/portal-firm-mark'
import { TaxYearSelect } from '@/components/tax/tax-year-select'
import type { PortalSessionView } from '@/lib/supabase/portal-session'

/** Shared portal chrome: firm mark, tax year, profile menu. */
export function PortalHeader({
  session,
  onYearChange,
  maxWidthClass = 'max-w-7xl',
}: {
  session: PortalSessionView
  onYearChange?: () => void
  maxWidthClass?: string
}) {
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const firstName = session.name.split(/\s+/).filter(Boolean)[0] ?? null
  const welcomeLine = firstName ? `Welcome, ${firstName}` : null

  useEffect(() => {
    if (!profileOpen) return
    function onPointerDown(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [profileOpen])

  async function handleSignOut() {
    await fetch('/api/portal/logout', { method: 'POST' })
    router.push('/portal')
    router.refresh()
  }

  return (
    <header className="border-b border-slate-200/80 bg-white">
      <div
        className={`mx-auto flex ${maxWidthClass} items-center justify-between gap-4 px-6 py-4 lg:px-8`}
      >
        <Link href="/portal/upload" className="min-w-0">
          <PortalFirmMark
            firmName={session.firmName}
            logoUrl={session.logoUrl}
            subtitle={welcomeLine}
            iconClassName="size-12 text-lg"
            textClassName="text-lg"
          />
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
            <span className="text-xs font-medium text-slate-500">Tax year</span>
            <TaxYearSelect
              mode="portal"
              showLabel={false}
              years={session.taxYears.length ? session.taxYears : [session.taxYear]}
              value={session.taxYear}
              onYearChange={onYearChange}
            />
          </div>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 hover:bg-slate-50"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-[#0061FF] text-xs font-semibold text-white">
                {session.initials || '••'}
              </span>
              <ChevronDown className="size-4 text-slate-400" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <div className="border-b border-slate-100 px-4 py-2">
                  <p className="truncate text-sm font-medium text-slate-900">{session.name}</p>
                  <p className="truncate text-xs text-slate-500">{session.email}</p>
                </div>
                <Link
                  href="/portal/upload"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setProfileOpen(false)}
                >
                  <UploadCloud className="size-4 text-slate-400" />
                  Upload documents
                </Link>
                <Link
                  href="/portal/your-info"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setProfileOpen(false)}
                >
                  <UserRound className="size-4 text-slate-400" />
                  Your info
                </Link>
                <Link
                  href="/portal/tax-data"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setProfileOpen(false)}
                >
                  <FileSpreadsheet className="size-4 text-slate-400" />
                  Tax data
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full border-t border-slate-100 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
