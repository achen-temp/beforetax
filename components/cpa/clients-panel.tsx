'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ClientStatus = 'not_started' | 'needs_review' | 'in_progress' | 'complete'
type ClientSort = 'priority' | 'recent' | 'name' | 'newest'

interface ClientSummary {
  id: string
  name: string
  email: string
  phone: string | null
  created_at: string
  last_accessed_at: string | null
  otp_sent_at: string | null
  portal_token: string | null
  tax_year: number | null
  doc_count: number
  processing_count: number
  review_count: number
  failed_count: number
  lowconf_count: number
  last_activity_at: string | null
  status: ClientStatus
}

type StatusCounts = { all: number } & Record<ClientStatus, number>

const PAGE_SIZE = 25

const STATUS_META: Record<ClientStatus, { label: string; badge: string; dot: string }> = {
  needs_review: {
    label: 'Needs review',
    badge: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
  in_progress: {
    label: 'In progress',
    badge: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    dot: 'bg-blue-500',
  },
  not_started: {
    label: 'Not started',
    badge: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    dot: 'bg-slate-400',
  },
  complete: {
    label: 'Complete',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
}

const TABS: { id: ClientStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs_review', label: 'Needs review' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'not_started', label: 'Not started' },
  { id: 'complete', label: 'Complete' },
]

const SORTS: { id: ClientSort; label: string }[] = [
  { id: 'priority', label: 'Needs review first' },
  { id: 'recent', label: 'Recently active' },
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'newest', label: 'Newest first' },
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const sec = Math.round((Date.now() - then) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  const mo = Math.round(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(mo / 12)}y ago`
}

function StatusBadge({ status }: { status: ClientStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.badge}`}
    >
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

function DocumentsCell({ client }: { client: ClientSummary }) {
  if (client.doc_count === 0) {
    return <span className="text-muted-foreground">No documents</span>
  }
  return (
    <span className="whitespace-nowrap text-foreground">
      {client.doc_count} doc{client.doc_count === 1 ? '' : 's'}
      {client.review_count > 0 && (
        <span className="text-amber-600"> · {client.review_count} to review</span>
      )}
      {client.failed_count > 0 && (
        <span className="text-destructive"> · {client.failed_count} failed</span>
      )}
    </span>
  )
}

/** Firm-side invite signal: never emailed vs last OTP email time. */
function InviteHint({ otpSentAt }: { otpSentAt: string | null }) {
  if (!otpSentAt) {
    return <span className="text-amber-700">Not invited</span>
  }
  return <span className="text-muted-foreground">Invited · {relativeTime(otpSentAt)}</span>
}

export function ClientsPanel() {
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [counts, setCounts] = useState<StatusCounts>({
    all: 0,
    not_started: 0,
    needs_review: 0,
    in_progress: 0,
    complete: 0,
  })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<ClientStatus | 'all'>('all')
  const [sort, setSort] = useState<ClientSort>('priority')
  const [page, setPage] = useState(1)

  const [addOpen, setAddOpen] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Debounce the search box; a new query always returns to the first page.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const params = new URLSearchParams()
      if (debounced) params.set('search', debounced)
      if (status !== 'all') params.set('status', status)
      params.set('sort', sort)
      params.set('page', String(page))
      try {
        const res = await fetch(`/api/clients?${params.toString()}`)
        const data = await res.json()
        if (!cancelled && res.ok) {
          setClients(data.clients ?? [])
          setTotal(data.total ?? 0)
          if (data.counts) setCounts(data.counts)
        }
      } catch {
        // Network errors leave the previous list; row actions surface a banner.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debounced, status, sort, page, reloadKey])

  async function handleSendOtp(clientId: string, alreadySent: boolean) {
    setSendingId(clientId)
    setBanner(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/send-otp`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send OTP')
      setBanner({
        kind: 'success',
        text: data.devOtp
          ? `Dev mode — new OTP: ${data.devOtp}${
              data.portalUrl ? ` · link: ${data.portalUrl}` : ''
            }`
          : alreadySent
            ? 'New access code sent to client.'
            : 'Invitation sent to client.',
      })
      setReloadKey((k) => k + 1)
    } catch (e) {
      setBanner({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to send OTP' })
    } finally {
      setSendingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)
  const filtering = debounced.length > 0 || status !== 'all'

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clients</h1>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add client
        </Button>
      </div>

      {banner && (
        <div
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as ClientSort)
            setPage(1)
          }}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => {
          const active = status === tab.id
          const count = tab.id === 'all' ? counts.all : counts[tab.id]
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatus(tab.id)
                setPage(1)
              }}
              className={`relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Documents</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Last activity</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 animate-pulse rounded-full bg-muted" />
                        <div className="space-y-2">
                          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                          <div className="h-2.5 w-40 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="ml-auto h-8 w-28 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {filtering ? (
                      'No clients match these filters.'
                    ) : (
                      <span>
                        No clients yet.{' '}
                        <button
                          type="button"
                          onClick={() => setAddOpen(true)}
                          className="font-medium text-primary hover:underline"
                        >
                          Add your first client
                        </button>
                        .
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${client.id}`}
                        className="group flex items-center gap-3"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(client.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground group-hover:text-primary">
                            {client.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {client.email}
                            <span className="mx-1.5 text-slate-300">·</span>
                            <InviteHint otpSentAt={client.otp_sent_at} />
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={client.status} />
                    </td>
                    <td className="px-4 py-3">
                      <DocumentsCell client={client} />
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
                      {relativeTime(client.last_activity_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/clients/${client.id}`}>Open</Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={sendingId === client.id}
                          onClick={() => handleSendOtp(client.id, !!client.otp_sent_at)}
                        >
                          {sendingId === client.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <RefreshCw className="size-4" />
                          )}
                          <span className="hidden sm:inline">
                            {client.otp_sent_at ? 'Resend OTP' : 'Send OTP'}
                          </span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <span className="tabular-nums">
              Page {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {addOpen && (
        <AddClientModal
          onClose={() => setAddOpen(false)}
          onAdded={(text) => {
            setAddOpen(false)
            setBanner({ kind: 'success', text })
            setReloadKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}

function AddClientModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState<'save' | 'invite' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(sendOtp: boolean) {
    setLoading(sendOtp ? 'invite' : 'save')
    setError(null)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || undefined, sendOtp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add client')
      if (!sendOtp) {
        onAdded(`Client added. You can send their portal invite anytime.`)
      } else {
        onAdded(
          data.devOtp
            ? `Client added. Dev mode — OTP: ${data.devOtp}${
                data.portalUrl ? ` · link: ${data.portalUrl}` : ''
              }`
            : `Invitation sent to ${data.client.email}.`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add client')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add client"
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">Add client</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Save them now, or also send a portal invite with a one-time code.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit(false)
          }}
          className="mt-4 space-y-4"
        >
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="add-name">Client name</Label>
            <Input
              id="add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-email">Email</Label>
            <Input
              id="add-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-phone">Phone (optional)</Label>
            <Input id="add-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={!!loading}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={!!loading}>
              {loading === 'save' ? 'Adding…' : 'Add client only'}
            </Button>
            <Button
              type="button"
              disabled={!!loading}
              onClick={() => void submit(true)}
            >
              {loading === 'invite' ? 'Sending…' : 'Add & send OTP'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
