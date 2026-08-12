'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft, ListChecks, Loader2 } from 'lucide-react'
import { PortalHeader } from '@/components/client/portal-header'
import { SiteFooter } from '@/components/site-footer'
import { TaxDataSections } from '@/components/tax/tax-data-sections'
import { orderedDocuments, type TaxDataView as TaxDataViewModel } from '@/lib/tax/build-tax-data'
import type { PortalSessionView } from '@/lib/supabase/portal-session'

export function TaxDataView({
  initialSession,
}: {
  initialSession: PortalSessionView
}) {
  const router = useRouter()
  const [session, setSession] = useState(initialSession)
  const [data, setData] = useState<TaxDataViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [taxRes, sessionRes] = await Promise.all([
      fetch('/api/portal/tax-data'),
      fetch('/api/portal/session'),
    ])
    if (taxRes.status === 401 || sessionRes.status === 401) {
      router.push('/portal')
      return
    }
    if (!taxRes.ok) {
      setError('We couldn’t load your tax data. Please try again.')
      setLoading(false)
      return
    }
    setData((await taxRes.json()) as TaxDataViewModel)
    if (sessionRes.ok) {
      setSession((await sessionRes.json()) as PortalSessionView)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fb]">
      <PortalHeader
        session={session}
        onYearChange={() => {
          setLoading(true)
          void loadData()
        }}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 lg:px-8">
        <Link
          href="/portal/upload"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="size-4" />
          Back to documents
        </Link>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Your tax data</h1>
          {data &&
            (() => {
              const firstDocId = orderedDocuments(data)[0]?.id
              if (!firstDocId) return null
              return (
                <Link
                  href={`/portal/tax-data/review/${firstDocId}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <ListChecks className="size-4" />
                  Review all
                </Link>
              )
            })()}
        </div>

        {loading && (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Loading your tax data…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-100 bg-red-50/60 p-6 text-sm text-red-700">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {(() => {
              const totalReview =
                data.sections.reduce(
                  (s, sec) => s + sec.documents.reduce((n, d) => n + d.reviewCount, 0),
                  0
                ) + data.additionalDocuments.reduce((n, d) => n + d.reviewCount, 0)
              if (totalReview === 0) return null
              return (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-medium">
                      {totalReview} value{totalReview === 1 ? '' : 's'} need
                      {totalReview === 1 ? 's' : ''} a quick check
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      We read these with lower confidence (often faint scans or state boxes). The
                      fields marked <span className="font-medium">Verify</span> below are worth
                      confirming against your document.
                    </p>
                  </div>
                </div>
              )
            })()}

            <TaxDataSections data={data} role="client" onDataChanged={() => void loadData()} />
          </div>
        )}
      </main>

      <SiteFooter poweredBy maxWidthClass="max-w-4xl" />
    </div>
  )
}
