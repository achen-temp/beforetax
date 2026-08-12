'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import {
  ChevronRight,
  Copy,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
  UploadCloud,
} from 'lucide-react'
import { PortalHeader } from '@/components/client/portal-header'
import { SiteFooter } from '@/components/site-footer'
import { Button } from '@/components/ui/button'
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE_MB,
  RECOMMENDED_FORMATS_LABEL,
  SUPPORTED_FORMATS_LABEL,
  sha256Hex,
  validateFile,
} from '@/lib/files'
import type { PortalSessionView } from '@/lib/supabase/portal-session'

interface DocumentRow {
  id: string
  file_name: string
  file_size: number
  extraction_status: string
  created_at: string
}

type SessionInfo = PortalSessionView

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function statusLabel(status: string) {
  switch (status) {
    case 'complete':
      return { text: 'Detected', className: 'bg-emerald-50 text-emerald-700' }
    case 'queued':
      return { text: 'Queued', className: 'bg-slate-100 text-slate-600', spinning: true }
    case 'processing':
      return { text: 'Processing', className: 'bg-blue-50 text-blue-700', spinning: true }
    case 'failed':
      return { text: 'Failed', className: 'bg-red-50 text-red-700' }
    default:
      return { text: 'Processing', className: 'bg-blue-50 text-blue-700', spinning: true }
  }
}

/** A document is still moving through the pipeline (waiting in the queue or
 * being extracted) — used to decide when to poll for updates. */
function isPending(status: string): boolean {
  return status === 'queued' || status === 'processing'
}

export function PortalUploadDashboard({
  initialSession,
}: {
  initialSession: PortalSessionView
}) {
  const router = useRouter()
  const [session, setSession] = useState<SessionInfo>(initialSession)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [uploading, setUploading] = useState(false)
  /** When set, shows “Uploading 2 of 5…” during a multi-file batch. */
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    const [sessionRes, docsRes] = await Promise.all([
      fetch('/api/portal/session'),
      fetch('/api/portal/documents'),
    ])

    if (sessionRes.status === 401 || docsRes.status === 401) {
      router.push('/portal')
      return
    }

    if (sessionRes.ok) {
      const data = await sessionRes.json()
      setSession(data)
    }

    if (docsRes.ok) {
      const data = await docsRes.json()
      setDocuments(data.documents ?? [])
    }
  }, [router])

  const enqueueAndRefresh = useCallback(
    async (documentId: string) => {
      // /process now only enqueues a background job and returns immediately (202).
      // We refresh once to show the Queued state; the pending-poll effect tracks
      // it through processing to complete. Transport errors are reconciled by the
      // next loadData / tab focus.
      try {
        await fetch(`/api/portal/documents/${documentId}/process`, { method: 'POST' })
      } catch {
        // ignore — status is reconciled by loadData
      }
      await loadData()
    },
    [loadData]
  )

  /** Upload + enqueue one file. Returns a result so a batch can continue after
   * a single failure or duplicate — never aborts the whole selection. */
  const uploadOneFile = useCallback(
    async (file: File): Promise<'uploaded' | 'duplicate' | 'error'> => {
      validateFile(file)

      // Hash before minting an upload URL so identical re-uploads are rejected
      // without receiving the bytes.
      const fileHash = await sha256Hex(file)

      const res = await fetch('/api/portal/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          fileHash,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 409 && data.code === 'DUPLICATE') {
        return 'duplicate'
      }
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : `Failed to upload “${file.name}”`
        )
      }

      const uploadRes = await fetch(data.uploadUrl as string, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!uploadRes.ok) throw new Error(`Failed to store “${file.name}”`)

      const documentId = (data.document as { id: string }).id
      // Enqueue extraction immediately; batch continues with the next file.
      void enqueueAndRefresh(documentId)
      return 'uploaded'
    },
    [enqueueAndRefresh]
  )

  const onDrop = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      setError(null)
      setStatusNote(null)
      setUploading(true)
      setUploadProgress({ current: 0, total: files.length })

      let uploaded = 0
      let duplicates = 0
      const failures: string[] = []

      // Sequential on purpose: each file is an independent document/job, but we
      // avoid hammering signed-URL + storage with a large parallel burst.
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        setUploadProgress({ current: i + 1, total: files.length })
        try {
          const result = await uploadOneFile(file)
          if (result === 'uploaded') uploaded += 1
          else duplicates += 1
        } catch (e) {
          failures.push(
            e instanceof Error ? e.message : `Failed to upload “${file.name}”`
          )
        }
      }

      await loadData()
      setUploading(false)
      setUploadProgress(null)

      const parts: string[] = []
      if (uploaded > 0) {
        parts.push(`${uploaded} file${uploaded === 1 ? '' : 's'} uploaded`)
      }
      if (duplicates > 0) {
        parts.push(
          `${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped (already uploaded)`
        )
      }
      if (failures.length > 0) {
        setError(failures.length === 1 ? failures[0]! : `${failures.length} files failed: ${failures[0]}`)
      } else {
        setError(null)
      }
      if (parts.length > 0) setStatusNote(parts.join(' · '))
    },
    [uploadOneFile, loadData]
  )

  useEffect(() => {
    // Initial data fetch on mount; loadData sets state only after awaiting the
    // network, so this is a legitimate load-on-mount (not a synchronous render loop).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()

    // Refresh when the client returns to the tab instead of polling on a timer.
    // Covers documents that finished while the tab was backgrounded and files
    // ingested elsewhere (e.g. by email). Event-driven, so it's idle otherwise.
    function refreshOnFocus() {
      if (!document.hidden) void loadData()
    }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [loadData])

  // Extraction now runs in a background queue, so poll ONLY while at least one
  // document is still queued/processing, and stop as soon as everything settles.
  // (Idle the rest of the time — no fixed-interval polling.)
  const hasPending = documents.some((d) => isPending(d.extraction_status))
  useEffect(() => {
    if (!hasPending) return
    const timer = setInterval(() => {
      if (!document.hidden) void loadData()
    }, 5000)
    return () => clearInterval(timer)
  }, [hasPending, loadData])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: true,
    disabled: uploading,
    noClick: true,
    accept: ACCEPTED_FILE_TYPES,
  })

  const intakeEmail = session.documentIntakeEmail?.trim() || null

  async function handleCopyEmail() {
    if (!intakeEmail) return
    await navigator.clipboard.writeText(intakeEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fb]">
      <PortalHeader session={session} onYearChange={() => void loadData()} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Column 1 — Upload */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-base font-semibold text-slate-900">
              <span className="text-[#0061FF]">1.</span> Upload your documents
            </h2>

            <div
              {...getRootProps()}
              className={`flex flex-1 flex-col rounded-xl border-2 border-dashed p-6 transition-colors ${
                isDragActive
                  ? 'border-[#0061FF] bg-blue-50/40'
                  : 'border-slate-200 bg-slate-50/60'
              } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-[#0061FF]/10">
                  {uploading ? (
                    <Loader2 className="size-7 animate-spin text-[#0061FF]" />
                  ) : (
                    <UploadCloud className="size-7 text-[#0061FF]" />
                  )}
                </div>
                <p className="font-medium text-slate-900">
                  {uploading && uploadProgress
                    ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
                    : 'Drag and drop files here'}
                </p>
                <p className="mt-1 text-xs text-slate-500">Select multiple files at once</p>
                <Button
                  type="button"
                  onClick={open}
                  disabled={uploading}
                  className="mt-4 rounded-lg bg-[#0061FF] px-6 hover:bg-[#0052d9]"
                >
                  Browse Files
                </Button>
                <div className="mt-4 space-y-0.5">
                  <p className="text-xs font-medium text-slate-600">
                    Recommended: {RECOMMENDED_FORMATS_LABEL}
                  </p>
                  <p className="text-xs text-slate-400">
                    Also accepts {SUPPORTED_FORMATS_LABEL} · Max {MAX_FILE_SIZE_MB}MB per file
                  </p>
                </div>
              </div>
            </div>

            {statusNote && (
              <p className="mt-3 text-sm text-emerald-700" role="status">
                {statusNote}
              </p>
            )}
            {error && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
              <p className="text-xs font-semibold text-slate-700">For the best results</p>
              <ul className="mt-1.5 space-y-1 text-xs text-slate-500">
                <li className="flex gap-1.5">
                  <span className="text-[#0061FF]">•</span>
                  Upload the original PDF when you have it — it&apos;s clearest for us to read.
                </li>
                <li className="flex gap-1.5">
                  <span className="text-[#0061FF]">•</span>
                  If you snap a photo, capture the whole page, in focus and well-lit.
                </li>
                <li className="flex gap-1.5">
                  <span className="text-[#0061FF]">•</span>
                  Avoid blurry, cropped, or glare-covered scans.
                </li>
              </ul>
            </div>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium uppercase text-slate-400">or</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Email documents to
              </p>
              {intakeEmail ? (
                <div className="mt-2 flex items-center gap-2">
                  <p className="flex-1 truncate text-sm font-medium text-slate-900">
                    {intakeEmail}
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    aria-label="Copy email"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Your tax preparer hasn&apos;t set an intake email yet. Upload
                  files here instead.
                </p>
              )}
              {copied && <p className="mt-1 text-xs text-emerald-600">Copied!</p>}
            </div>

            <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
              <p>
                Your documents are secure and private. We use bank-level encryption to protect your
                data.
              </p>
            </div>
          </section>

          {/* Column 2 — Documents received (list scrolls inside the card) */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:relative lg:overflow-hidden">
            <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">
                <span className="text-[#0061FF]">2.</span> Documents received
                <span className="ml-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-[#0061FF]">
                  {documents.length} {documents.length === 1 ? 'file' : 'files'}
                </span>
              </h2>
              <Link
                href="/portal/tax-data"
                className="inline-flex shrink-0 items-center gap-1.5 pr-1 text-sm font-medium text-[#0061FF] underline underline-offset-2 hover:text-[#0052d6]"
              >
                <FileSpreadsheet className="size-3.5" />
                Tax data
              </Link>
            </div>

            <div className="min-h-0 max-h-[min(24rem,55vh)] overflow-y-auto overscroll-contain lg:absolute lg:inset-x-6 lg:bottom-6 lg:top-[4.25rem] lg:max-h-none">
              {documents.length === 0 ? (
                <div className="flex h-full min-h-[12rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                  <FileText className="mb-3 size-8 text-slate-300" />
                  <p className="text-sm text-slate-500">No documents yet</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Upload one or more files to get started
                  </p>
                </div>
              ) : (
                <ul className="space-y-2 pr-1">
                  {documents.map((doc) => {
                    const status = statusLabel(doc.extraction_status)
                    return (
                      <li
                        key={doc.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3"
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
                          <FileText className="size-4 text-red-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {doc.file_name}
                          </p>
                          <p className="text-xs text-slate-400">
                            Uploaded {formatRelativeTime(doc.created_at)}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                        >
                          {status.spinning && (
                            <Loader2 className="size-3 animate-spin" />
                          )}
                          {status.text}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-slate-300" />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </main>

      <SiteFooter poweredBy />
    </div>
  )
}
