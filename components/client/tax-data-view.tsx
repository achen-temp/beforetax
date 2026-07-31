'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  Loader2,
} from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import type {
  TaxChecklistSection,
  TaxDataDocument,
  TaxDataView as TaxDataViewModel,
} from '@/lib/tax/build-tax-data'

function checklistBadge(status: TaxChecklistSection['status']) {
  switch (status) {
    case 'received':
      return { text: 'Received', className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 }
    case 'missing':
      return { text: 'Missing', className: 'bg-red-50 text-red-700', Icon: AlertCircle }
    default:
      return { text: 'Pending', className: 'bg-slate-100 text-slate-500', Icon: Clock }
  }
}

function docStatusBadge(status: string) {
  switch (status) {
    case 'complete':
      return { text: 'Extracted', className: 'bg-emerald-50 text-emerald-700' }
    case 'queued':
      return { text: 'Queued', className: 'bg-slate-100 text-slate-600', spinning: true }
    case 'failed':
      return { text: 'Couldn’t read', className: 'bg-red-50 text-red-700' }
    default:
      return { text: 'Processing', className: 'bg-blue-50 text-blue-700', spinning: true }
  }
}

export function TaxDataView() {
  const router = useRouter()
  const [data, setData] = useState<TaxDataViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/portal/tax-data')
      if (res.status === 401) {
        router.push('/portal')
        return
      }
      if (cancelled) return
      if (!res.ok) {
        setError('We couldn’t load your tax data. Please try again.')
        setLoading(false)
        return
      }
      const json = (await res.json()) as TaxDataViewModel
      if (cancelled) return
      setData(json)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [router])

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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Your tax data</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? (
              <>
                What we&apos;ve extracted for your {data.taxYear} return, organized by the checklist
                your CPA needs.
              </>
            ) : (
              'What we\u2019ve extracted from your documents, organized by your CPA\u2019s checklist.'
            )}
          </p>
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

            {!data.hasChecklist && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-600">
                Your CPA hasn&apos;t set up a document checklist yet. Anything you&apos;ve uploaded
                appears below as we extract it.
              </div>
            )}

            {data.sections.map((section) => (
              <ChecklistSectionCard key={section.type} section={section} />
            ))}

            {data.additionalDocuments.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Additional documents</h2>
                <div className="space-y-4">
                  {data.additionalDocuments.map((doc) => (
                    <DocumentCard key={doc.id} doc={doc} />
                  ))}
                </div>
              </section>
            )}

            {data.sections.length === 0 && data.additionalDocuments.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
                <FileText className="mb-3 size-8 text-slate-300" />
                <p className="text-sm text-slate-500">No tax data yet</p>
                <p className="mt-1 text-xs text-slate-400">
                  Upload a document and we&apos;ll extract the details here.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function ChecklistSectionCard({ section }: { section: TaxChecklistSection }) {
  const badge = checklistBadge(section.status)
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">{section.label}</h2>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          <badge.Icon className="size-3.5" />
          {badge.text}
        </span>
      </div>

      {section.documents.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          {section.status === 'missing'
            ? 'Not received yet — please upload this document.'
            : 'Waiting on this document.'}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {section.documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </section>
  )
}

function DocumentCard({ doc }: { doc: TaxDataDocument }) {
  const status = docStatusBadge(doc.status)
  const hasFields = doc.groups.some((g) => g.rows.length > 0)

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-red-500 shadow-sm">
          <FileText className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{doc.fileName}</p>
          <p className="truncate text-xs text-slate-400">{doc.formLabel}</p>
        </div>
        {doc.reviewCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            <AlertTriangle className="size-3" />
            {doc.reviewCount} to verify
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.spinning && <Loader2 className="size-3 animate-spin" />}
          {status.text}
        </span>
      </div>

      {doc.status === 'complete' && !hasFields && (
        <p className="mt-3 text-xs text-slate-400">
          No structured fields were extracted for this document.
        </p>
      )}

      {hasFields && (
        <div className="mt-4 space-y-4">
          {doc.groups.map((group, gi) => (
            <div key={gi}>
              {group.title && (
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {group.title}
                </p>
              )}
              <dl className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-white">
                {group.rows.map((row, ri) => (
                  <div
                    key={ri}
                    className={`grid grid-cols-[3.25rem_1fr_auto] items-baseline gap-3 px-3 py-2 ${
                      row.needsReview ? 'bg-amber-50/60' : ''
                    }`}
                  >
                    <div className="text-[10px] font-medium">
                      {row.box ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                          Box {row.box}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                    <dt className={`text-sm ${row.isEmpty ? 'text-slate-400' : 'text-slate-600'}`}>
                      {row.label}
                    </dt>
                    {row.isEmpty ? (
                      <dd className="flex shrink-0 items-center justify-end text-right text-sm text-slate-300">
                        —
                      </dd>
                    ) : (
                      <dd className="flex shrink-0 items-center justify-end gap-1.5 text-right text-sm font-medium text-slate-900">
                        {row.needsReview && (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                            title={
                              row.confidence !== null
                                ? `Low confidence (${Math.round(row.confidence * 100)}%) — please verify`
                                : 'Please verify'
                            }
                          >
                            <AlertTriangle className="size-2.5" />
                            Verify
                          </span>
                        )}
                        {row.value}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
