'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDropzone } from 'react-dropzone'
import {
  Bell,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Home,
  Loader2,
  Lock,
  MessageSquare,
  Shield,
  UploadCloud,
  Users,
} from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE_MB,
  RECOMMENDED_FORMATS_LABEL,
  SUPPORTED_FORMATS_LABEL,
  sha256Hex,
  validateFile,
} from '@/lib/files'

interface DocumentRow {
  id: string
  file_name: string
  file_size: number
  extraction_status: string
  created_at: string
}

interface SessionInfo {
  name: string
  email: string
  initials: string
  taxYear: number
}

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

const SECURITY_FEATURES = [
  {
    icon: Shield,
    iconClass: 'text-emerald-600 bg-emerald-50',
    title: 'Your data is secure',
    description: 'We use bank-level security and never share your information.',
  },
  {
    icon: Clock,
    iconClass: 'text-violet-600 bg-violet-50',
    title: 'Auto-save enabled',
    description: 'Your progress is saved automatically.',
  },
  {
    icon: Bell,
    iconClass: 'text-amber-600 bg-amber-50',
    title: "We'll notify you",
    description: "You'll get an email if we need anything else.",
  },
] as const

export function PortalUploadDashboard() {
  const router = useRouter()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [showAllDocs, setShowAllDocs] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0]
      if (!file) return

      setError(null)

      try {
        validateFile(file)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid file')
        return
      }

      setUploading(true)

      try {
        // Hash the bytes before asking for an upload URL so the server can reject
        // an identical re-upload without receiving the file.
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
        const data = await res.json()
        // Duplicate content: surface the notice and refresh so the existing doc
        // is visible; not a hard failure.
        if (res.status === 409 && data.code === 'DUPLICATE') {
          setError(data.error ?? 'You already uploaded this file.')
          await loadData()
          return
        }
        if (!res.ok) throw new Error(data.error ?? 'Upload failed')

        const uploadRes = await fetch(data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        })

        if (!uploadRes.ok) throw new Error('Failed to upload file to storage')

        await loadData()
        // The upload is done; enqueue extraction (returns immediately) and refresh
        // so the doc shows as Queued. The pending-poll effect then tracks it to
        // completion, and the dropzone is free for the next file right away.
        void enqueueAndRefresh(data.document.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [loadData, enqueueAndRefresh]
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
    multiple: false,
    disabled: uploading,
    noClick: true,
    accept: ACCEPTED_FILE_TYPES,
  })

  const firstName = session?.name.split(' ')[0] ?? 'there'
  const visibleDocs = showAllDocs ? documents : documents.slice(0, 5)
  const intakeEmail = session?.email ?? ''

  async function handleCopyEmail() {
    if (!intakeEmail) return
    await navigator.clipboard.writeText(intakeEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSignOut() {
    await fetch('/api/portal/logout', { method: 'POST' })
    router.push('/portal')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
          <BrandLogo iconClassName="size-8 text-xs" textClassName="text-base" />

          <div className="hidden flex-1 md:block">
            <h1 className="text-lg font-semibold text-slate-900">
              Welcome back, {firstName} 👋
            </h1>
            <p className="text-sm text-slate-500">
              Let&apos;s get your {session?.taxYear ?? new Date().getFullYear()} tax return
              completed.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Help"
            >
              <HelpCircle className="size-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2 hover:bg-slate-50"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-[#0061FF] text-xs font-semibold text-white">
                  {session?.initials ?? '••'}
                </span>
                <ChevronDown className="size-4 text-slate-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-slate-100 px-4 py-2">
                    <p className="truncate text-sm font-medium text-slate-900">{session?.name}</p>
                    <p className="truncate text-xs text-slate-500">{session?.email}</p>
                  </div>
                  <Link
                    href="/portal/tax-data"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
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

        <div className="border-t border-slate-100 px-6 py-3 md:hidden">
          <h1 className="text-base font-semibold text-slate-900">Welcome back, {firstName} 👋</h1>
          <p className="text-sm text-slate-500">
            Let&apos;s get your {session?.taxYear ?? new Date().getFullYear()} tax return completed.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-3">
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
                <p className="font-medium text-slate-900">Drag and drop files here</p>
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
              <div className="mt-2 flex items-center gap-2">
                <p className="flex-1 truncate text-sm font-medium text-slate-900">{intakeEmail}</p>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                  aria-label="Copy email"
                >
                  <Copy className="size-4" />
                </button>
              </div>
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

          {/* Column 2 — Documents received */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                <span className="text-[#0061FF]">2.</span> Documents received
              </h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-[#0061FF]">
                {documents.length} {documents.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                <FileText className="mb-3 size-8 text-slate-300" />
                <p className="text-sm text-slate-500">No documents yet</p>
                <p className="mt-1 text-xs text-slate-400">Upload a file to get started</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleDocs.map((doc) => {
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

            {documents.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllDocs((v) => !v)}
                className="mt-4 text-sm font-medium text-[#0061FF] hover:underline"
              >
                {showAllDocs ? 'Show less' : `Show all files (${documents.length})`}
              </button>
            )}
          </section>

          {/* Column 3 — Tax summary */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              <span className="text-[#0061FF]">3.</span> Tax summary
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              Here&apos;s what we&apos;ve found and what we may need.
            </p>

            <ul className="space-y-2">
              <TaxCategoryRow
                icon={DollarSign}
                iconClass="bg-emerald-50 text-emerald-600"
                label="Income"
                status={documents.length > 0 ? 'complete' : 'pending'}
              />
              <TaxCategoryRow
                icon={Briefcase}
                iconClass="bg-amber-50 text-amber-600"
                label="Investments"
                status="attention"
                detail="We may need: Brokerage statement showing cost basis (1099-B)"
              />
              <TaxCategoryRow
                icon={Home}
                iconClass="bg-emerald-50 text-emerald-600"
                label="Home"
                status="pending"
              />
              <TaxCategoryRow
                icon={FileText}
                iconClass="bg-violet-50 text-violet-600"
                label="Deductions"
                status="pending"
              />
              <TaxCategoryRow
                icon={Users}
                iconClass="bg-blue-50 text-blue-600"
                label="Family"
                status="pending"
              />
            </ul>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0061FF]/10">
                  <MessageSquare className="size-4 text-[#0061FF]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Questions for your tax pro?</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Send a message to your CPA firm anytime.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full rounded-lg border-slate-200"
                    disabled
                  >
                    Send a Message
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Security features */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {SECURITY_FEATURES.map(({ icon: Icon, iconClass, title, description }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
              >
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

function TaxCategoryRow({
  icon: Icon,
  iconClass,
  label,
  status,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  label: string
  status: 'complete' | 'attention' | 'pending'
  detail?: string
}) {
  const [expanded, setExpanded] = useState(status === 'attention')

  const badge =
    status === 'complete'
      ? { text: 'Complete', className: 'bg-emerald-50 text-emerald-700' }
      : status === 'attention'
        ? { text: 'Needs Attention', className: 'bg-amber-50 text-amber-700' }
        : { text: 'Pending', className: 'bg-slate-100 text-slate-500' }

  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/40">
      <button
        type="button"
        onClick={() => detail && setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
      >
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="size-4" />
        </div>
        <span className="flex-1 text-sm font-medium text-slate-900">{label}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.text}
        </span>
        {detail && (
          <ChevronDown
            className={`size-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        )}
      </button>
      {detail && expanded && (
        <div className="border-t border-amber-100 bg-amber-50/60 px-3 py-3 text-xs text-amber-900">
          {detail}
          <button type="button" className="ml-1 font-medium text-[#0061FF] hover:underline">
            Learn more
          </button>
        </div>
      )}
    </li>
  )
}
