'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  MoreVertical,
  RotateCcw,
} from 'lucide-react'
import type { TaxChecklistSection, TaxDataDocument, TaxDataView } from '@/lib/tax/build-tax-data'
import {
  FieldGroups,
  useFieldEditing,
  type EditorRole,
  type FieldEditingHandlers,
} from '@/components/tax/field-editing'

export type { EditorRole }

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
      return { text: 'Extracted', className: 'bg-emerald-50 text-emerald-700', spinning: false }
    case 'queued':
      return { text: 'Queued', className: 'bg-slate-100 text-slate-600', spinning: true }
    case 'failed':
      return { text: 'Couldn’t read', className: 'bg-red-50 text-red-700', spinning: false }
    default:
      return { text: 'Processing', className: 'bg-blue-50 text-blue-700', spinning: true }
  }
}

interface SectionProps {
  handlers: FieldEditingHandlers
  makeReviewHref?: (docId: string) => string
  onSkip: (docId: string) => void
  /** Move a year-mismatched doc to the year printed on the form. */
  onMoveYear?: (docId: string, year: number) => void
  busyIds: Set<string>
  moveError?: string | null
}

export function TaxDataSections({
  data,
  role,
  clientId,
  year,
  onDataChanged,
}: {
  data: TaxDataView
  role: EditorRole
  /** Required for CPA edits — scopes the mutation to this client's documents. */
  clientId?: string
  /** When set, CPA review links keep `?year=` so Check year stays consistent. */
  year?: number
  /** Called after a skip/restore so the caller can re-fetch. Falls back to a
   * router.refresh() (server components) when omitted. */
  onDataChanged?: () => void
}) {
  const router = useRouter()
  const handlers = useFieldEditing({ role, clientId })
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [moveError, setMoveError] = useState<string | null>(null)
  const yearQs = year != null ? `?year=${year}` : ''

  const makeReviewHref =
    role === 'cpa' && clientId
      ? (docId: string) => `/clients/${clientId}/review/${docId}${yearQs}`
      : role === 'client'
        ? (docId: string) => `/portal/tax-data/review/${docId}`
        : undefined

  async function setExcluded(docId: string, excluded: boolean) {
    setBusyIds((prev) => new Set(prev).add(docId))
    setMoveError(null)
    try {
      const endpoint =
        role === 'cpa'
          ? `/api/cpa/documents/${docId}/exclude`
          : `/api/portal/documents/${docId}/exclude`
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded }),
      })
      if (!res.ok) throw new Error('exclude failed')
      if (onDataChanged) onDataChanged()
      else router.refresh()
    } catch {
      // Leave the row in place; the button simply stops spinning so the user can retry.
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }

  async function moveYear(docId: string, targetYear: number) {
    setBusyIds((prev) => new Set(prev).add(docId))
    setMoveError(null)
    try {
      const endpoint =
        role === 'cpa'
          ? `/api/cpa/documents/${docId}/move-year`
          : `/api/portal/documents/${docId}/move-year`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          role === 'cpa' ? { year: targetYear, clientId } : { year: targetYear }
        ),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMoveError(typeof body.error === 'string' ? body.error : 'Couldn’t move document')
        return
      }
      if (onDataChanged) onDataChanged()
      else router.refresh()
    } catch {
      setMoveError('Couldn’t move document')
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }

  const sectionProps: SectionProps = {
    handlers,
    makeReviewHref,
    onSkip: (docId) => setExcluded(docId, true),
    onMoveYear: moveYear,
    busyIds,
  }
  const hasAnything =
    data.sections.length > 0 ||
    data.additionalDocuments.length > 0 ||
    data.excludedDocuments.length > 0

  return (
    <div className="space-y-4">
      {moveError && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {moveError}
        </p>
      )}
      {!data.hasChecklist &&
        (data.sections.length > 0 || data.additionalDocuments.length > 0) && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-600">
            No document checklist is set up yet. Everything uploaded appears below as it&apos;s
            extracted.
          </div>
        )}

      {data.sections.map((section) => (
        <ChecklistSectionCard key={section.type} section={section} {...sectionProps} />
      ))}

      {data.additionalDocuments.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Additional documents</h2>
          <div className="space-y-4">
            {data.additionalDocuments.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} {...sectionProps} />
            ))}
          </div>
        </section>
      )}

      {data.excludedDocuments.length > 0 && (
        <ExcludedSection
          docs={data.excludedDocuments}
          busyIds={busyIds}
          onRestore={(docId) => setExcluded(docId, false)}
        />
      )}

      {!hasAnything && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <FileText className="mb-3 size-8 text-slate-300" />
          <p className="text-sm text-slate-500">No tax data yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Upload a document and the details show up here.
          </p>
        </div>
      )}
    </div>
  )
}

/** Collapsed area for skipped documents, with a restore action. Starts collapsed
 * so it stays out of the way but nothing silently disappears. */
function ExcludedSection({
  docs,
  busyIds,
  onRestore,
}: {
  docs: TaxDataDocument[]
  busyIds: Set<string>
  onRestore: (docId: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <ChevronRight
          className={`size-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <h2 className="text-sm font-semibold text-slate-900">Skipped documents</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {docs.length}
        </span>
        <span className="ml-1 text-xs text-slate-400">not used in your tax data</span>
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {docs.map((doc) => {
            const busy = busyIds.has(doc.id)
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-500 line-through decoration-slate-300">
                    {doc.fileName}
                  </p>
                  <p className="truncate text-xs text-slate-400">{doc.formLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onRestore(doc.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Restore
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ChecklistSectionCard({ section, ...rest }: { section: TaxChecklistSection } & SectionProps) {
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
          {section.status === 'missing' ? 'Not received yet.' : 'Waiting on this document.'}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {section.documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} {...rest} />
          ))}
        </div>
      )}
    </section>
  )
}

/** Overflow menu for secondary actions (move year, skip). Behind ⋯ to avoid
 * accidental clicks. */
function DocActionsMenu({
  onSkip,
  onMoveYear,
  moveYearLabel,
  busy,
}: {
  onSkip: () => void
  onMoveYear?: () => void
  moveYearLabel?: string
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="More actions"
        className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {onMoveYear && moveYearLabel && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onMoveYear()
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
              >
                <ArrowRightLeft className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span>
                  <span className="block text-sm font-medium text-slate-700">{moveYearLabel}</span>
                  <span className="block text-xs text-slate-400">
                    Form year doesn’t match this return
                  </span>
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onSkip()
              }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
            >
              <EyeOff className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <span>
                <span className="block text-sm font-medium text-slate-700">Skip document</span>
                <span className="block text-xs text-slate-400" hidden>
                  Keep the file, don’t use it in the tax data
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function DocumentCard({
  doc,
  handlers,
  makeReviewHref,
  onSkip,
  onMoveYear,
  busyIds,
}: { doc: TaxDataDocument } & SectionProps) {
  const [expanded, setExpanded] = useState(false)
  const status = docStatusBadge(doc.status)
  const hasFields = doc.groups.some((g) => g.rows.length > 0)
  const reviewHref = makeReviewHref?.(doc.id)
  const busy = busyIds.has(doc.id)

  // Live verification progress — reflects inline edits/verifies without a reload.
  const effRows = doc.groups.flatMap((g) => g.rows).map((r) => handlers.effective(r))
  const fieldRows = effRows.filter((r) => r.fieldId)
  const verifiableN = fieldRows.length
  const verifiedN = fieldRows.filter((r) => r.isVerified).length
  const attentionN = fieldRows.filter(
    (r) => !r.isVerified && (r.needsReview || r.clientEdited)
  ).length
  const allVerified = verifiableN > 0 && verifiedN === verifiableN

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => hasFields && setExpanded((v) => !v)}
          disabled={!hasFields}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        >
          {hasFields ? (
            <ChevronRight
              className={`size-4 shrink-0 text-slate-400 transition-transform ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          ) : (
            <span className="size-4 shrink-0" />
          )}
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-red-500 shadow-sm">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{doc.fileName}</p>
            <p className="truncate text-xs text-slate-400">{doc.formLabel}</p>
          </div>
        </button>

        {doc.segmentationUncertain && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700"
            title="This file may contain more than one form. It couldn’t be split with confidence — please review."
          >
            <AlertTriangle className="size-3" />
            Check split
          </span>
        )}
        {doc.yearMismatch && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700"
            title={`This form is marked tax year ${doc.taxYearOnForm ?? '—'}, which differs from this return — confirm it belongs here.`}
          >
            <AlertTriangle className="size-3" />
            Check year
          </span>
        )}

        {doc.status === 'complete' && attentionN > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {attentionN} to verify
          </span>
        )}

        {doc.status === 'complete' && verifiableN > 0 && (
          allVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="size-3.5" />
              All verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {verifiedN}/{verifiableN} verified
            </span>
          )
        )}

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
        >
          {status.spinning && <Loader2 className="size-3 animate-spin" />}
          {status.text}
        </span>

        {reviewHref && doc.status === 'complete' && (
          <Link
            href={reviewHref}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            <Eye className="size-3.5" />
            Review
          </Link>
        )}
        <DocActionsMenu
          onSkip={() => onSkip(doc.id)}
          onMoveYear={
            doc.yearMismatch && doc.taxYearOnForm != null && onMoveYear
              ? () => onMoveYear(doc.id, doc.taxYearOnForm!)
              : undefined
          }
          moveYearLabel={
            doc.yearMismatch && doc.taxYearOnForm != null
              ? `Move to ${doc.taxYearOnForm}`
              : undefined
          }
          busy={busy}
        />
      </div>

      {expanded && doc.status === 'complete' && !hasFields && (
        <p className="px-4 pb-4 text-xs text-slate-400">No structured fields were extracted.</p>
      )}

      {expanded && hasFields && (
        <div className="border-t border-slate-100 px-4 py-4">
          <FieldGroups groups={doc.groups} handlers={handlers} />
        </div>
      )}
    </div>
  )
}
