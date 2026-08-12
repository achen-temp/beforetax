'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCpaName } from '@/lib/cpa/display-name'
import type { FirmMember } from '@/lib/supabase/cpa-users'
import type { PendingInvite } from '@/lib/supabase/firm-invites'
import type { CpaUserRole } from '@/types'

function roleLabel(role: CpaUserRole | string) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function TeamPanel({
  members,
  invites,
  currentUserId,
}: {
  members: FirmMember[]
  invites: PendingInvite[]
  currentUserId: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [devInviteUrl, setDevInviteUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'sent'>('idle')

  function refresh() {
    router.refresh()
  }

  function invite(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDevInviteUrl(null)
    setStatus('idle')
    startTransition(async () => {
      try {
        const res = await fetch('/api/cpa/team/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'staff' }),
        })
        const data = (await res.json()) as {
          error?: string
          devInviteUrl?: string
        }
        if (!res.ok) {
          setError(data.error ?? 'Unable to send invite.')
          return
        }
        setEmail('')
        setStatus('sent')
        if (data.devInviteUrl) setDevInviteUrl(data.devInviteUrl)
        refresh()
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  function revokeInvite(inviteId: string) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/cpa/team/invites/${inviteId}`, { method: 'DELETE' })
        const data = (await res.json()) as { error?: string }
        if (!res.ok) {
          setError(data.error ?? 'Unable to revoke invite.')
          return
        }
        refresh()
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  function removeMember(memberId: string) {
    if (!window.confirm('Remove this teammate from the firm?')) return
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/cpa/team/members/${memberId}`, { method: 'DELETE' })
        const data = (await res.json()) as { error?: string }
        if (!res.ok) {
          setError(data.error ?? 'Unable to remove member.')
          return
        }
        refresh()
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Invite</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="inviteEmail">Colleague email</Label>
              <Input
                id="inviteEmail"
                type="email"
                autoComplete="email"
                required
                disabled={pending}
                placeholder="colleague@firm.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:w-36">
              <Label htmlFor="inviteRole">Role</Label>
              <select
                id="inviteRole"
                disabled
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                value="staff"
              >
                <option value="staff">Staff</option>
              </select>
            </div>
            <Button type="submit" disabled={pending} className="sm:mb-0">
              {pending ? 'Sending…' : 'Send invite'}
            </Button>
          </form>

          <div className="min-h-4 space-y-2 text-sm" aria-live="polite">
            {error && <p className="text-destructive">{error}</p>}
            {!error && status === 'sent' && (
              <p className="text-emerald-600">Invite sent.</p>
            )}
            {devInviteUrl && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Dev mode (no Resend key):{' '}
                <a
                  href={devInviteUrl}
                  className="font-medium underline underline-offset-2"
                >
                  open invite link
                </a>
              </p>
            )}
          </div>

          {invites.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                Pending invites
              </h3>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
                {invites.map((inviteRow) => (
                  <li
                    key={inviteRow.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {inviteRow.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        {roleLabel(inviteRow.role)} · expires{' '}
                        {new Date(inviteRow.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => revokeInvite(inviteRow.id)}
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            {members.map((member) => {
              const canRemove =
                member.id !== currentUserId && member.role !== 'owner'
              const displayName = formatCpaName(member)
              const isYou = member.id === currentUserId
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {displayName}
                      {isYou ? (
                        <span className="ml-1.5 font-normal text-slate-400">(you)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {roleLabel(member.role)}
                      {displayName !== member.email ? ` · ${member.email}` : ''}
                    </p>
                  </div>
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => removeMember(member.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
