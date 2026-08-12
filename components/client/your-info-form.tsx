'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2, Plus, Trash2, UserRound } from 'lucide-react'
import { PortalHeader } from '@/components/client/portal-header'
import { SiteFooter } from '@/components/site-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FILING_STATUSES,
  FILING_STATUS_LABELS,
  emptyHouseholdInfo,
  type FilingStatus,
  type HouseholdInfo,
} from '@/lib/tax/household-info'
import type { PortalSessionView } from '@/lib/supabase/portal-session'

type YourInfoResponse = {
  year: number
  info: HouseholdInfo
  suggestion: HouseholdInfo | null
  suggestionSource: { documentId: string; fileName: string } | null
  error?: string
}

export function YourInfoForm({
  initialSession,
}: {
  initialSession: PortalSessionView
}) {
  const router = useRouter()
  const [session, setSession] = useState(initialSession)
  const [year, setYear] = useState(initialSession.taxYear)
  const [info, setInfo] = useState<HouseholdInfo>(emptyHouseholdInfo())
  const [suggestion, setSuggestion] = useState<HouseholdInfo | null>(null)
  const [suggestionSource, setSuggestionSource] = useState<{
    documentId: string
    fileName: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saved'>('idle')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [infoRes, sessionRes] = await Promise.all([
        fetch('/api/portal/your-info'),
        fetch('/api/portal/session'),
      ])
      if (infoRes.status === 401 || sessionRes.status === 401) {
        router.push('/portal')
        return
      }
      if (sessionRes.ok) {
        setSession((await sessionRes.json()) as PortalSessionView)
      }
      const data = (await infoRes.json()) as YourInfoResponse
      if (!infoRes.ok) {
        setError(data.error ?? 'Couldn’t load your info.')
        return
      }
      setYear(data.year)
      setInfo(data.info)
      setSuggestion(data.suggestion)
      setSuggestionSource(data.suggestionSource)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  function patch<K extends keyof HouseholdInfo>(key: K, value: HouseholdInfo[K]) {
    setInfo((prev) => ({ ...prev, [key]: value }))
    setStatus('idle')
  }

  function applySuggestion() {
    if (!suggestion) return
    setInfo(suggestion)
    setSuggestion(null)
    setSuggestionSource(null)
    setStatus('idle')
  }

  function addDependent() {
    patch('dependents', [
      ...info.dependents,
      { name: '', ssn: '', relationship: '', dob: '' },
    ])
  }

  function updateDependent(
    index: number,
    key: 'name' | 'ssn' | 'relationship' | 'dob',
    value: string
  ) {
    patch(
      'dependents',
      info.dependents.map((d, i) => (i === index ? { ...d, [key]: value } : d))
    )
  }

  function removeDependent(index: number) {
    patch(
      'dependents',
      info.dependents.filter((_, i) => i !== index)
    )
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/portal/your-info', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(info),
        })
        const data = (await res.json()) as { info?: HouseholdInfo; error?: string }
        if (!res.ok) {
          setError(data.error ?? 'Couldn’t save.')
          return
        }
        if (data.info) setInfo(data.info)
        setStatus('saved')
        setSuggestion(null)
        setSuggestionSource(null)
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fb]">
      <PortalHeader session={session} onYearChange={() => void load()} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8 lg:px-8">
        <Link
          href="/portal/upload"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="size-4" />
          Back to documents
        </Link>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Your info</h1>
          <p className="mt-1 text-sm text-slate-500">
            Household details for the {year} tax year — not from uploaded W-2s.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Loading…
          </div>
        ) : (
          <form onSubmit={onSave} className="space-y-4">
            {suggestion && suggestionSource && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950">
                <p className="font-medium">We found details on your prior-year return</p>
                <p className="mt-1 text-blue-800/80">
                  From <span className="font-medium">{suggestionSource.fileName}</span>. Review
                  and apply — nothing is saved until you click Save.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={applySuggestion}
                >
                  Use these details
                </Button>
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <UserRound className="size-4 text-slate-400" />
                Filing status
              </h2>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={info.filingStatus ?? ''}
                onChange={(e) =>
                  patch(
                    'filingStatus',
                    (e.target.value || null) as FilingStatus | null
                  )
                }
              >
                <option value="">Select…</option>
                {FILING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {FILING_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">You</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id="taxpayer-name"
                  label="Full name"
                  value={info.taxpayerName}
                  onChange={(v) => patch('taxpayerName', v)}
                />
                <Field
                  id="taxpayer-ssn"
                  label="SSN"
                  value={info.taxpayerSsn}
                  onChange={(v) => patch('taxpayerSsn', v)}
                  autoComplete="off"
                />
                <Field
                  id="taxpayer-dob"
                  label="Date of birth"
                  value={info.taxpayerDob}
                  onChange={(v) => patch('taxpayerDob', v)}
                  placeholder="YYYY-MM-DD"
                />
                <Field
                  id="taxpayer-phone"
                  label="Phone"
                  value={info.phone}
                  onChange={(v) => patch('phone', v)}
                  autoComplete="tel"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Spouse</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id="spouse-name"
                  label="Full name"
                  value={info.spouseName}
                  onChange={(v) => patch('spouseName', v)}
                />
                <Field
                  id="spouse-ssn"
                  label="SSN"
                  value={info.spouseSsn}
                  onChange={(v) => patch('spouseSsn', v)}
                  autoComplete="off"
                />
                <Field
                  id="spouse-dob"
                  label="Date of birth"
                  value={info.spouseDob}
                  onChange={(v) => patch('spouseDob', v)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">Address</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field
                    id="address-street"
                    label="Street"
                    value={info.addressStreet}
                    onChange={(v) => patch('addressStreet', v)}
                    autoComplete="street-address"
                  />
                </div>
                <Field
                  id="address-city"
                  label="City"
                  value={info.addressCity}
                  onChange={(v) => patch('addressCity', v)}
                  autoComplete="address-level2"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="address-state"
                    label="State"
                    value={info.addressState}
                    onChange={(v) => patch('addressState', v.toUpperCase().slice(0, 2))}
                    autoComplete="address-level1"
                  />
                  <Field
                    id="address-zip"
                    label="ZIP"
                    value={info.addressZip}
                    onChange={(v) => patch('addressZip', v)}
                    autoComplete="postal-code"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Dependents</h2>
                <Button type="button" size="sm" variant="outline" onClick={addDependent}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
              {info.dependents.length === 0 ? (
                <p className="text-sm text-slate-400">No dependents listed.</p>
              ) : (
                <ul className="space-y-3">
                  {info.dependents.map((dep, index) => (
                    <li
                      key={index}
                      className="rounded-xl border border-slate-100 bg-slate-50/50 p-3"
                    >
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          aria-label="Remove dependent"
                          onClick={() => removeDependent(index)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          id={`dep-${index}-name`}
                          label="Name"
                          value={dep.name}
                          onChange={(v) => updateDependent(index, 'name', v)}
                        />
                        <Field
                          id={`dep-${index}-ssn`}
                          label="SSN"
                          value={dep.ssn}
                          onChange={(v) => updateDependent(index, 'ssn', v)}
                          autoComplete="off"
                        />
                        <Field
                          id={`dep-${index}-rel`}
                          label="Relationship"
                          value={dep.relationship}
                          onChange={(v) => updateDependent(index, 'relationship', v)}
                        />
                        <Field
                          id={`dep-${index}-dob`}
                          label="Date of birth"
                          value={dep.dob}
                          onChange={(v) => updateDependent(index, 'dob', v)}
                          placeholder="YYYY-MM-DD"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-900">
                Refund direct deposit
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  id="refund-routing"
                  label="Routing number"
                  value={info.refundRoutingNumber}
                  onChange={(v) => patch('refundRoutingNumber', v)}
                  autoComplete="off"
                />
                <Field
                  id="refund-account"
                  label="Account number"
                  value={info.refundAccountNumber}
                  onChange={(v) => patch('refundAccountNumber', v)}
                  autoComplete="off"
                />
                <Field
                  id="refund-type"
                  label="Account type"
                  value={info.refundAccountType}
                  onChange={(v) => patch('refundAccountType', v)}
                  placeholder="checking or savings"
                />
              </div>
            </section>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
              {status === 'saved' && (
                <span className="text-sm text-emerald-600">Saved</span>
              )}
            </div>
          </form>
        )}
      </main>

      <SiteFooter poweredBy maxWidthClass="max-w-3xl" />
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
