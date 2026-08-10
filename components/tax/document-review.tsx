'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react'
import type { TaxDataDocument } from '@/lib/tax/build-tax-data'
import { DocumentViewer } from '@/components/tax/document-viewer'
import {
  CollapsibleFieldGroups,
  useFieldEditing,
  type EditorRole,
} from '@/components/tax/field-editing'

const SPLIT_MIN = 30
const SPLIT_MAX = 75
const SPLIT_DEFAULT = 60

/**
 * Fullscreen review workspace: the original document on the left (60%), its
 * extracted fields on the right (40%) as a top-down accordion. When a queue is
 * supplied it steps through every document one by one (Prev/Next, Verify & next).
 * Shared by the CPA review route and the client portal.
 */
export function DocumentReview({
  doc,
  role,
  clientId,
  fileEndpoint,
  verifyAllEndpoint,
  backHref,
  backLabel,
  prevHref,
  nextHref,
  position,
}: {
  doc: TaxDataDocument
  role: EditorRole
  clientId?: string
  fileEndpoint: string
  /** CPA-only: bulk "mark all verified" endpoint. */
  verifyAllEndpoint?: string
  backHref: string
  backLabel: string
  /** Sibling documents in the review queue (null when at an end). */
  prevHref?: string | null
  nextHref?: string | null
  /** 1-based position + total for the "Doc i of N" indicator. */
  position?: { index: number; total: number }
}) {
  const router = useRouter()
  const handlers = useFieldEditing({ role, clientId })
  const [bulkSaving, setBulkSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leftPct, setLeftPct] = useState(SPLIT_DEFAULT)
  const [dragging, setDragging] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)

  const onSplitMove = useCallback((clientX: number) => {
    const el = splitRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    setLeftPct(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct)))
  }, [])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => onSplitMove(e.clientX)
    const onUp = () => setDragging(false)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, onSplitMove])

  const rows = doc.groups.flatMap((g) => g.rows).filter((r) => r.fieldId)
  const verifiable = rows.length
  const verified = rows.filter((r) => handlers.effective(r).isVerified).length
  const allVerified = verifiable > 0 && verified === verifiable
  const firstPage = doc.pageNumbers && doc.pageNumbers.length > 0 ? doc.pageNumbers[0] : undefined
  const hasFields = doc.groups.some((g) => g.rows.length > 0)
  const isLast = !nextHref

  function goNext() {
    router.push(nextHref ?? backHref)
  }

  async function verifyAll(thenAdvance: boolean) {
    if (!verifyAllEndpoint) {
      if (thenAdvance) goNext()
      return
    }
    setBulkSaving(true)
    setError(null)
    try {
      const res = await fetch(verifyAllEndpoint, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Failed to verify')
      }
      handlers.onVerifyMany(rows)
      if (thenAdvance) goNext()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to verify')
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
        <Link
          href={backHref}
          title={backLabel}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="size-4" />
          <span className="hidden sm:inline">Close</span>
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-slate-900">{doc.fileName}</h1>
          <p className="truncate text-xs text-slate-500">
            {doc.formLabel}
            {doc.pageNumbers && doc.pageNumbers.length > 0 && (
              <span> · page{doc.pageNumbers.length > 1 ? 's' : ''} {doc.pageNumbers.join(', ')}</span>
            )}
          </p>
        </div>

        {/* Queue navigation */}
        {position && position.total > 1 && (
          <div className="flex items-center gap-1">
            <NavArrow href={prevHref} dir="prev" />
            <span className="whitespace-nowrap px-1 text-xs font-medium text-slate-500">
              Doc {position.index} of {position.total}
            </span>
            <NavArrow href={nextHref} dir="next" />
          </div>
        )}

        {verifiable > 0 && (
          <span
            className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${
              allVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {allVerified ? <CheckCircle2 className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
            {verified}/{verifiable} verified
          </span>
        )}

        {/* Primary advance action */}
        {verifyAllEndpoint ? (
          <button
            type="button"
            onClick={() => verifyAll(true)}
            disabled={bulkSaving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {bulkSaving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {isLast ? 'Verify & finish' : 'Verify & next'}
          </button>
        ) : (
          !isLast && (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Next
              <ArrowRight className="size-4" />
            </button>
          )
        )}
      </header>

      {/* Split body: document left / fields right (default 60/40, draggable on lg+) */}
      <div ref={splitRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Mobile: stacked viewer */}
        <div className="h-[40vh] shrink-0 border-b border-slate-200 bg-slate-100 lg:hidden">
          <DocumentViewer fileEndpoint={fileEndpoint} initialPage={firstPage} />
        </div>

        {/* Desktop: resizable columns */}
        <div className="hidden min-h-0 w-full flex-1 lg:flex">
          <div className="min-h-0 shrink-0 bg-slate-100" style={{ width: `${leftPct}%` }}>
            <DocumentViewer fileEndpoint={fileEndpoint} initialPage={firstPage} />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(leftPct)}
            aria-valuemin={SPLIT_MIN}
            aria-valuemax={SPLIT_MAX}
            title="Drag to resize"
            onMouseDown={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            className={`relative z-10 w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-primary/40 ${
              dragging ? 'bg-primary/50' : ''
            }`}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <FieldsPanel doc={doc} error={error} hasFields={hasFields} handlers={handlers} />
          </div>
        </div>

        {/* Mobile fields panel */}
        <div className="min-h-0 flex-1 overflow-auto lg:hidden">
          <FieldsPanel doc={doc} error={error} hasFields={hasFields} handlers={handlers} />
        </div>
      </div>
    </div>
  )
}

function FieldsPanel({
  doc,
  error,
  hasFields,
  handlers,
}: {
  doc: TaxDataDocument
  error: string | null
  hasFields: boolean
  handlers: ReturnType<typeof useFieldEditing>
}) {
  return (
    <div className="p-4">
      {doc.segmentationUncertain && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2 text-sm text-orange-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange-600" />
          <span>
            This file may contain more than one form and couldn’t be split with confidence. Check
            the original against the fields.
          </span>
        </div>
      )}
      {doc.yearMismatch && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2 text-sm text-orange-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange-600" />
          <span>
            This form is marked tax year <strong>{doc.taxYearOnForm ?? '—'}</strong>, which differs
            from the return you’re working on. Confirm it belongs here.
          </span>
        </div>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {hasFields ? (
        <CollapsibleFieldGroups groups={doc.groups} handlers={handlers} />
      ) : (
        <p className="py-10 text-center text-sm text-slate-400">
          No structured fields were extracted from this document.
        </p>
      )}
    </div>
  )
}

function NavArrow({ href, dir }: { href?: string | null; dir: 'prev' | 'next' }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  const label = dir === 'prev' ? 'Previous document' : 'Next document'
  if (!href) {
    return (
      <span className="inline-flex size-7 items-center justify-center rounded-lg text-slate-300">
        <Icon className="size-4" />
      </span>
    )
  }
  return (
    <Link
      href={href}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    >
      <Icon className="size-4" />
    </Link>
  )
}
