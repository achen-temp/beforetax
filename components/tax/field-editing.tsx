'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'
import { labelForCode, type TaxFieldGroup, type TaxFieldRow } from '@/lib/tax/build-tax-data'
import { US_STATES } from '@/lib/tax/us-states'
import { W2_BOX12_CODES } from '@/lib/tax/w2-box12-codes'

export type EditorRole = 'cpa' | 'client'

/** Local edit state layered over a row without cloning the whole view tree.
 * All fields optional so an override can patch just what changed (and adopt the
 * created field id when a previously-empty box is filled in). */
interface RowOverride {
  value?: string
  rawValue?: string
  isVerified?: boolean
  clientEdited?: boolean
  needsReview?: boolean
  isEmpty?: boolean
  fieldId?: string
  code?: string | null
  label?: string
}

/** Stable identity for a row's override: its field id, or a synthetic key for a
 * still-empty (createable) box so its filled value survives a re-render. */
function rowKey(row: TaxFieldRow): string | null {
  if (row.fieldId) return row.fieldId
  if (row.documentId && row.fieldKey) {
    return `new:${row.documentId}:${row.fieldKey}:${row.lineIndex ?? 0}:${row.box ?? ''}`
  }
  return null
}

export function formatForDisplay(dataType: string | undefined, raw: string): string {
  const v = raw.trim()
  if (v === '') return ''
  if (dataType === 'number') {
    const n = Number(v.replace(/[$,\s]/g, ''))
    if (Number.isFinite(n)) return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    return raw
  }
  if (dataType !== 'date') {
    if (v.toLowerCase() === 'true') return 'Yes'
    if (v.toLowerCase() === 'false') return 'No'
  }
  return raw
}

export interface FieldEditingHandlers {
  role: EditorRole
  canVerify: boolean
  effective: (row: TaxFieldRow) => TaxFieldRow
  /** Record a saved value for a row (existing or newly created). */
  onSet: (
    row: TaxFieldRow,
    raw: string,
    opts?: { fieldId?: string; code?: string | null }
  ) => void
  onVerify: (row: TaxFieldRow) => void
  onVerifyMany: (rows: TaxFieldRow[]) => void
  patchField: (fieldId: string, body: Record<string, unknown>) => Promise<void>
  /** Create a field for a previously-empty box; returns the new field id. */
  createField: (
    row: TaxFieldRow,
    value: string,
    opts?: { code?: string | null }
  ) => Promise<string>
}

/**
 * Shared correction state for the tax-data list and the document review screen.
 * Keeps optimistic per-field overrides and issues the role-appropriate PATCH
 * (existing field) or POST (fill in a blank box).
 */
export function useFieldEditing({
  role,
  clientId,
}: {
  role: EditorRole
  /** Required for CPA edits — scopes the mutation to this client's documents. */
  clientId?: string
}): FieldEditingHandlers {
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({})
  const canVerify = role === 'cpa'

  const effective = (row: TaxFieldRow): TaxFieldRow => {
    const key = rowKey(row)
    if (!key) return row
    const o = overrides[key]
    return o ? { ...row, ...o } : row
  }

  function setOverride(row: TaxFieldRow, patch: RowOverride) {
    const key = rowKey(row)
    if (!key) return
    setOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), ...patch } }))
  }

  async function patchField(fieldId: string, body: Record<string, unknown>): Promise<void> {
    const url = role === 'cpa' ? `/api/cpa/fields/${fieldId}` : `/api/portal/fields/${fieldId}`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(role === 'cpa' ? { ...body, clientId } : body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? 'Save failed')
    }
  }

  async function createField(
    row: TaxFieldRow,
    value: string,
    opts?: { code?: string | null }
  ): Promise<string> {
    const url =
      role === 'cpa'
        ? `/api/cpa/documents/${row.documentId}/fields`
        : `/api/portal/documents/${row.documentId}/fields`
    const code = opts?.code !== undefined ? opts.code : (row.code ?? null)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldKey: row.fieldKey,
        box: row.box ?? null,
        lineIndex: row.lineIndex ?? 0,
        code,
        dataType: row.dataType ?? 'text',
        value,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? 'Save failed')
    }
    const data = await res.json()
    return data.field.id as string
  }

  function onSet(row: TaxFieldRow, raw: string, opts?: { fieldId?: string; code?: string | null }) {
    const nextCode = opts?.code !== undefined ? opts.code : row.code
    const fallbackLabel = row.codeInput ? (row.codeInput === 'w2box12' ? 'Box 12' : 'Box 14') : row.label
    setOverride(row, {
      value: formatForDisplay(row.dataType, raw),
      rawValue: raw,
      isVerified: role === 'cpa',
      clientEdited: role === 'client',
      needsReview: false,
      isEmpty: false,
      ...(opts?.fieldId ? { fieldId: opts.fieldId } : {}),
      ...(opts?.code !== undefined
        ? {
            code: nextCode ?? null,
            label: labelForCode(row.codeInput, nextCode, fallbackLabel),
          }
        : {}),
    })
  }

  function onVerify(row: TaxFieldRow) {
    const base = effective(row)
    setOverride(row, {
      value: base.value,
      rawValue: base.rawValue ?? '',
      isVerified: true,
      clientEdited: false,
      needsReview: false,
    })
  }

  function onVerifyMany(rows: TaxFieldRow[]) {
    setOverrides((prev) => {
      const next = { ...prev }
      for (const row of rows) {
        const key = rowKey(row)
        if (!key) continue
        const base = { ...row, ...(next[key] ?? {}) }
        next[key] = {
          ...(next[key] ?? {}),
          value: base.value,
          rawValue: base.rawValue ?? '',
          isVerified: true,
          clientEdited: false,
          needsReview: false,
        }
      }
      return next
    })
  }

  return { role, canVerify, effective, onSet, onVerify, onVerifyMany, patchField, createField }
}

/** Render a document's field groups with inline edit/verify controls. */
export function FieldGroups({
  groups,
  handlers,
}: {
  groups: TaxFieldGroup[]
  handlers: FieldEditingHandlers
}) {
  return (
    <div className="space-y-4">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.title && (
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {group.title}
            </p>
          )}
          <dl className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-white">
            {group.rows.map((row, ri) => (
              <FieldRow key={row.fieldId ?? `${row.fieldKey ?? 'r'}-${row.lineIndex ?? ri}-${row.box ?? ''}`} row={row} handlers={handlers} />
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

/** Accordion variant for the review workflow: every group collapses, only the
 * first opens by default, and each header shows how many values still need a
 * check — so a reviewer can work top-down, one section at a time. */
export function CollapsibleFieldGroups({
  groups,
  handlers,
}: {
  groups: TaxFieldGroup[]
  handlers: FieldEditingHandlers
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set(groups.length > 0 ? [0] : []))

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="space-y-2">
      {groups.map((group, gi) => {
        const isOpen = open.has(gi)
        const rows = group.rows.map((r) => handlers.effective(r))
        const toCheck = rows.filter(
          (r) => r.fieldId && !r.isVerified && (r.needsReview || r.clientEdited)
        ).length
        const filled = rows.filter((r) => r.fieldId).length
        const done = filled > 0 && toCheck === 0
        return (
          <div key={gi} className="overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => toggle(gi)}
              className="flex w-full items-center gap-2 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
            >
              <ChevronRight
                className={`size-4 shrink-0 text-slate-400 transition-transform ${
                  isOpen ? 'rotate-90' : ''
                }`}
              />
              <span className="flex-1 text-sm font-semibold text-slate-700">
                {group.title ?? 'Form boxes'}
              </span>
              {toCheck > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {toCheck} to verify
                </span>
              ) : done ? (
                <CheckCircle2 className="size-4 text-emerald-500" />
              ) : null}
            </button>
            {isOpen && (
              <dl className="divide-y divide-slate-100 bg-white">
                {group.rows.map((row, ri) => (
                  <FieldRow
                    key={row.fieldId ?? `${row.fieldKey ?? 'r'}-${row.lineIndex ?? ri}-${row.box ?? ''}`}
                    row={row}
                    handlers={handlers}
                  />
                ))}
              </dl>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function FieldRow({ row: baseRow, handlers }: { row: TaxFieldRow; handlers: FieldEditingHandlers }) {
  const { role, canVerify, effective, onSet, onVerify, patchField, createField } = handlers
  const row = effective(baseRow)
  // Populated rows edit their existing field; still-empty rows can be filled in
  // when the schema supplied create metadata (createable).
  const editable = !!row.fieldId || baseRow.createable === true
  const isState = baseRow.inputType === 'state'
  const isYesNo = baseRow.inputType === 'yesno'
  const isCoded = !!baseRow.codeInput
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftCode, setDraftCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    // Yes/No fields store "true"/"false"; normalize any display form into that.
    if (baseRow.inputType === 'yesno') {
      const raw = (row.rawValue ?? row.value ?? '').trim().toLowerCase()
      setDraft(raw === 'true' || raw === 'yes' ? 'true' : raw === 'false' || raw === 'no' ? 'false' : '')
    } else {
      setDraft(row.rawValue ?? '')
    }
    setDraftCode(row.code ?? '')
    setEditing(true)
    setError(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      if (isCoded) {
        const code = draftCode.trim()
        if (!code) throw new Error(baseRow.codeInput === 'w2box12' ? 'Pick a Box 12 code' : 'Enter a description')
        if (!draft.trim()) throw new Error('Enter an amount')
        const normalized =
          baseRow.codeInput === 'w2box12' ? code.toUpperCase() : code
        if (row.fieldId) {
          await patchField(row.fieldId, { value: draft, code: normalized })
          onSet(baseRow, draft, { code: normalized })
        } else {
          const newId = await createField(baseRow, draft, { code: normalized })
          onSet(baseRow, draft, { fieldId: newId, code: normalized })
        }
      } else if (row.fieldId) {
        await patchField(row.fieldId, { value: draft })
        onSet(baseRow, draft)
      } else {
        const newId = await createField(baseRow, draft)
        onSet(baseRow, draft, { fieldId: newId })
      }
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function verify() {
    if (!row.fieldId) return
    setSaving(true)
    setError(null)
    try {
      await patchField(row.fieldId, { verified: true })
      onVerify(baseRow)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verify failed')
    } finally {
      setSaving(false)
    }
  }

  // While editing a coded slot, the description/code lives in the input — hide the
  // static label so "Box 14 — Other" / "SUI" don't sit on top of the description field.
  const hideLabel = editing && isCoded

  return (
    <div
      className={`grid items-baseline gap-3 px-3 py-2 ${
        hideLabel ? 'grid-cols-[3.25rem_1fr]' : 'grid-cols-[3.25rem_1fr_auto]'
      } ${row.needsReview ? 'bg-amber-50/60' : ''}`}
    >
      <div className="text-[10px] font-medium">
        {row.box ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">Box {row.box}</span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>

      {editing && isCoded ? (
        <dd className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {baseRow.codeInput === 'w2box12' ? (
            <select
              autoFocus
              value={draftCode}
              onChange={(e) => setDraftCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false)
              }}
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">Code…</option>
              {W2_BOX12_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.description}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              value={draftCode}
              onChange={(e) => setDraftCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') setEditing(false)
              }}
              placeholder={baseRow.label}
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-primary focus:outline-none"
            />
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder="Amount"
            className="w-28 shrink-0 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={save}
            disabled={saving}
            className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
            title="Save"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            title="Cancel"
          >
            <X className="size-4" />
          </button>
          {error && <span className="basis-full text-right text-[10px] text-red-600">{error}</span>}
        </dd>
      ) : (
        <dt className={`min-w-0 text-sm ${row.isEmpty ? 'text-slate-400' : 'text-slate-600'}`}>
          <span className="truncate">{row.label}</span>
        </dt>
      )}

      {/* Value column — skipped while a coded slot is editing (inputs already fill the label column). */}
      {!hideLabel &&
        (editing ? (
          <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {isState ? (
              <select
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="w-44 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
              >
                <option value="">—</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            ) : isYesNo ? (
              <select
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
              >
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="w-40 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
              />
            )}
            <button
              onClick={save}
              disabled={saving}
              className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
              title="Save"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded p-1 text-slate-400 hover:bg-slate-100"
              title="Cancel"
            >
              <X className="size-4" />
            </button>
            {error && <span className="basis-full text-right text-[10px] text-red-600">{error}</span>}
          </dd>
        ) : row.isEmpty ? (
          <dd className="flex shrink-0 items-center justify-end gap-1.5 text-right text-sm text-slate-300">
            <span>—</span>
            {editable && (
              <button
                onClick={startEdit}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-primary"
                title={isCoded ? 'Add code & amount' : 'Add value'}
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </dd>
        ) : (
          <dd className="flex shrink-0 items-center justify-end gap-1.5 text-right text-sm font-medium text-slate-900">
            {row.isVerified ? (
              <span
                className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                title="Verified by your accountant"
              >
                <ShieldCheck className="size-2.5" />
                Verified
              </span>
            ) : row.clientEdited ? (
              <span
                className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                title={
                  role === 'cpa'
                    ? 'Corrected by the client — please review'
                    : 'Your correction (pending review)'
                }
              >
                <Pencil className="size-2.5" />
                {role === 'cpa' ? 'Client edited' : 'Your edit'}
              </span>
            ) : row.needsReview ? (
              <span
                className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                title={
                  row.confidence !== null && row.confidence !== undefined
                    ? `Low confidence (${Math.round(row.confidence * 100)}%) — please verify`
                    : 'Please verify'
                }
              >
                <AlertTriangle className="size-2.5" />
                Verify
              </span>
            ) : null}

            <span>{row.value}</span>

            {editable && (
              <button
                onClick={startEdit}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title={isCoded ? 'Edit code & amount' : 'Edit value'}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {!!row.fieldId && canVerify && !row.isVerified && (
              <button
                onClick={verify}
                disabled={saving}
                className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                title="Mark verified"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              </button>
            )}
            {error && <span className="text-[10px] text-red-600">{error}</span>}
          </dd>
        ))}
    </div>
  )
}
