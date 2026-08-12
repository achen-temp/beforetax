'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/**
 * Compact tax-year picker. CPA mode updates the URL `?year=`; portal mode POSTs
 * to `/api/portal/tax-year` (cookie) then refreshes.
 */
export function TaxYearSelect({
  years,
  value,
  mode,
  /** CPA: pathname to keep when swapping ?year= (e.g. /clients/uuid). */
  pathname,
  /** Portal client pages: re-fetch after the cookie is set. */
  onYearChange,
  /** When false, only the <select> is shown (parent supplies its own label). */
  showLabel = true,
}: {
  years: number[]
  value: number
  mode: 'cpa' | 'portal'
  pathname?: string
  onYearChange?: () => void
  showLabel?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const options = years.includes(value) ? years : [value, ...years].sort((a, b) => b - a)

  async function onChange(next: number) {
    if (next === value) return
    startTransition(async () => {
      if (mode === 'portal') {
        const res = await fetch('/api/portal/tax-year', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: next }),
        })
        if (!res.ok) return
        onYearChange?.()
        router.refresh()
        return
      }
      const base = pathname ?? window.location.pathname
      const params = new URLSearchParams(window.location.search)
      params.set('year', String(next))
      router.push(`${base}?${params.toString()}`)
    })
  }

  const select = (
    <select
      value={value}
      disabled={pending || options.length === 0}
      onChange={(e) => void onChange(Number(e.target.value))}
      className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-900 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
      aria-label="Tax year"
    >
      {options.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )

  if (!showLabel) return select

  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-500">Tax year</span>
      {select}
    </label>
  )
}
