'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut, Settings, User, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCpaInitials, formatCpaName } from '@/lib/cpa/display-name'
import type { CpaUserRole } from '@/types'

/**
 * Avatar menu = firm + personal admin.
 * Tax workflow (Clients / Field catalog) stays in the top nav.
 */
export function UserMenu({
  email,
  firmName,
  role,
  firstName,
  lastName,
}: {
  email: string
  firmName: string | null
  role: CpaUserRole
  firstName: string | null
  lastName: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const displayName = formatCpaName({
    first_name: firstName,
    last_name: lastName,
    email,
  })
  const initial = formatCpaInitials({
    first_name: firstName,
    last_name: lastName,
    email,
    firmName,
  })
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  const isOwner = role === 'owner'

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-sm transition-colors hover:border-slate-300"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Firm and account menu"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-[#0061FF] text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate font-medium text-slate-700 sm:block">
          {firmName ?? displayName}
        </span>
        <ChevronDown
          className={`size-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">
              {firmName ?? 'Your firm'}
            </p>
            <p className="truncate text-xs text-slate-500">
              {displayName} · {roleLabel}
            </p>
          </div>

          <div className="py-1">
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <User className="size-4 text-slate-400" />
              My profile
            </Link>
            {isOwner && (
              <>
                <Link
                  href="/team"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Users className="size-4 text-slate-400" />
                  Team
                </Link>
                <Link
                  href="/settings"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Settings className="size-4 text-slate-400" />
                  Firm settings
                </Link>
              </>
            )}
          </div>

          <div className="border-t border-slate-100 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <LogOut className="size-4" />
              {loggingOut ? 'Signing out…' : 'Log out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
