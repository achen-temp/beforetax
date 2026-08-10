'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft, ListChecks, Loader2 } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { TaxDataSections } from '@/components/tax/tax-data-sections'
import { TaxYearSelect } from '@/components/tax/tax-year-select'
import { orderedDocuments, type TaxDataView as TaxDataViewModel } from '@/lib/tax/build-tax-data'

export function TaxDataView() {
  const router = useRouter()
  const [data, setData] = useState<TaxDataViewModel | null>(null)
  const [years, setYears] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [taxRes, yearRes] = await Promise.all([
      fetch('/api/portal/tax-data'),
      fetch('/api/portal/tax-year'),
    ])
    if (taxRes.status === 401 || yearRes.status === 401) {
      router.push('/portal')
      return
    }
    if (!taxRes.ok) {
      setError('We couldn’t load your tax data. Please try again.')
      setLoading(false)
      return
    }
    const json = (await taxRes.json()) as TaxDataViewModel
    setData(json)
    if (yearRes.ok) {
      const y = (await yearRes.json()) as { years?: number[] }
      setYears(y.years?.length ? y.years : [json.taxYear])
    } else {
      setYears([json.taxYear])
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
          <BrandLogo iconClassName="size-8 text-xs" textClassName="text-base" />
          <Link
            href="/portal/upload"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="size-4" />
            Back to documents
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your tax data</h1>
            <p className="mt-1 text-sm text-slate-500">
              {data ? (
                <>
                  What we&apos;ve extracted for your {data.taxYear} return, organized by the
                  checklist your CPA needs.
                </>
              ) : (
                'What we\u2019ve extracted from your documents, organized by your CPA\u2019s checklist.'
              )}
            </p>
            {data && (
              <div className="mt-3">
                <TaxYearSelect
                  mode="portal"
                  years={years.length ? years : [data.taxYear]}
                  value={data.taxYear}
                  onYearChange={() => {
                    setLoading(true)
                    void loadData()
                  }}
                />
              </div>
            )}
          </div>
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
    </div>
  )
}
