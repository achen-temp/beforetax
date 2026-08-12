'use client'

import { useState, useTransition } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { saveAccountProfile } from '@/app/(cpa)/account/actions'
import { formatCpaInitials, formatCpaName } from '@/lib/cpa/display-name'
import type { CpaUserRole } from '@/types'

type EditField = 'firstName' | 'lastName' | null

export function AccountProfileForm({
  firstName: initialFirst,
  lastName: initialLast,
  email,
  role,
  firmName,
}: {
  firstName: string | null
  lastName: string | null
  email: string
  role: CpaUserRole
  firmName: string | null
}) {
  const [firstName, setFirstName] = useState(initialFirst ?? '')
  const [lastName, setLastName] = useState(initialLast ?? '')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<EditField>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const displayName = formatCpaName({
    first_name: firstName,
    last_name: lastName,
    email,
  })
  const initials = formatCpaInitials({
    first_name: firstName,
    last_name: lastName,
    email,
    firmName,
  })

  function startEdit(field: 'firstName' | 'lastName') {
    setEditing(field)
    setDraft(field === 'firstName' ? firstName : lastName)
    setError(null)
  }

  function cancelEdit() {
    setEditing(null)
    setDraft('')
    setError(null)
  }

  function saveField() {
    if (!editing || !draft.trim()) return
    const nextFirst = editing === 'firstName' ? draft : firstName
    const nextLast = editing === 'lastName' ? draft : lastName
    setError(null)
    startTransition(async () => {
      const result = await saveAccountProfile({
        firstName: nextFirst,
        lastName: nextLast,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setFirstName(result.firstName)
      setLastName(result.lastName)
      setEditing(null)
      setDraft('')
    })
  }

  const rows = [
    {
      key: 'firstName',
      label: 'First name',
      value: firstName || '—',
      field: 'firstName' as const,
    },
    {
      key: 'lastName',
      label: 'Last name',
      value: lastName || '—',
      field: 'lastName' as const,
    },
    { key: 'email', label: 'Email', value: email },
    {
      key: 'role',
      label: 'Role',
      value: role.charAt(0).toUpperCase() + role.slice(1),
    },
    { key: 'firm', label: 'Firm', value: firmName ?? '—' },
  ] as const

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-full bg-[#0061FF] text-xl font-semibold text-white">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-slate-900">{displayName}</p>
          <p className="truncate text-sm text-slate-500">{email}</p>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
        {rows.map((row) => {
          const field = 'field' in row ? row.field : null
          const isEditing = field !== null && editing === field
          return (
            <div key={row.key} className="flex min-h-12 items-center gap-2 px-4 py-2">
              <dt className="w-28 shrink-0 text-sm text-slate-500">{row.label}</dt>
              <dd className="min-w-0 flex-1">
                {isEditing ? (
                  <Input
                    autoFocus
                    type="text"
                    maxLength={50}
                    disabled={pending}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        saveField()
                      }
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    className="ml-auto h-8 w-full max-w-[11rem] text-sm"
                  />
                ) : (
                  <p className="truncate text-right text-sm font-medium text-slate-900">
                    {row.value}
                  </p>
                )}
              </dd>
              {isEditing ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={saveField}
                    disabled={pending || !draft.trim()}
                    className="flex size-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                    aria-label="Save"
                  >
                    <Check className="size-4" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={pending}
                    className="flex size-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40"
                    aria-label="Cancel"
                  >
                    <X className="size-4" strokeWidth={2.5} />
                  </button>
                </div>
              ) : field ? (
                <button
                  type="button"
                  onClick={() => startEdit(field)}
                  disabled={pending || editing !== null}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
                  aria-label={`Edit ${row.label.toLowerCase()}`}
                >
                  <Pencil className="size-3.5" />
                </button>
              ) : (
                <span className="size-8 shrink-0" aria-hidden />
              )}
            </div>
          )
        })}
      </dl>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
