'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, ChevronDown, Circle, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  addIntakeItemAction,
  applyIntakeTemplateAction,
  removeIntakeItemAction,
  setIntakeItemStatusAction,
} from '@/app/(cpa)/clients/[id]/checklist/actions'
import {
  INTAKE_CATEGORIES,
  INTAKE_CATEGORY_HEADER,
  intakeProgress,
  type IntakeCategoryId,
  type IntakeChecklistItem,
  type IntakeItemStatus,
} from '@/lib/tax/intake-checklist'

function StatusButton({
  active,
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  disabled?: boolean
  className: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${className} ${
        active ? 'ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'
      }`}
    >
      {children}
    </button>
  )
}

export function IntakeChecklistPanel({
  clientId,
  year,
  initialItems,
}: {
  clientId: string
  year: number
  initialItems: IntakeChecklistItem[]
}) {
  const [items, setItems] = useState(initialItems)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [addingCategory, setAddingCategory] = useState<IntakeCategoryId | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<IntakeCategoryId>>(() => new Set())

  const progress = useMemo(() => intakeProgress(items), [items])

  const byCategory = useMemo(() => {
    return INTAKE_CATEGORIES.map((cat) => ({
      ...cat,
      items: items.filter((i) => i.categoryId === cat.id),
    }))
  }, [items])

  function isCollapsed(id: IntakeCategoryId) {
    return collapsed.has(id)
  }

  function toggleCollapsed(id: IntakeCategoryId) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandCategory(id: IntakeCategoryId) {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function run(
    action: () => Promise<{ ok: true; items: IntakeChecklistItem[] } | { ok: false; error: string }>
  ) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setItems(result.items)
      setPendingDeleteId(null)
    })
  }

  function setStatus(itemId: string, status: IntakeItemStatus) {
    run(() => setIntakeItemStatusAction({ clientId, year, itemId, status }))
  }

  function requestDelete(itemId: string) {
    setPendingDeleteId(itemId)
    cancelAdd()
    setError(null)
  }

  function cancelDelete() {
    setPendingDeleteId(null)
  }

  function confirmDelete(itemId: string) {
    run(() => removeIntakeItemAction({ clientId, year, itemId }))
  }

  function applyTemplate() {
    if (
      items.length > 0 &&
      !window.confirm('Replace the current checklist with your firm template?')
    ) {
      return
    }
    run(() => applyIntakeTemplateAction({ clientId, year }))
  }

  function startAdd(categoryId: IntakeCategoryId) {
    expandCategory(categoryId)
    setAddingCategory(categoryId)
    setDraftLabel('')
    setPendingDeleteId(null)
    setError(null)
  }

  function cancelAdd() {
    setAddingCategory(null)
    setDraftLabel('')
  }

  function confirmAdd(categoryId: IntakeCategoryId) {
    const label = draftLabel.trim()
    if (!label) return
    run(async () => {
      const result = await addIntakeItemAction({
        clientId,
        year,
        categoryId,
        label,
      })
      if (result.ok) {
        setAddingCategory(null)
        setDraftLabel('')
      }
      return result
    })
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">
          No tax prep checklist for {year} yet.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Apply your firm&apos;s template from Firm settings (or the platform
          default), then mark items received or N/A.
        </p>
        <Button
          type="button"
          className="mt-4"
          disabled={pending}
          onClick={applyTemplate}
        >
          {pending ? 'Applying…' : 'Apply firm checklist'}
        </Button>
        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">
            {progress.received}/{progress.total}
          </span>{' '}
          received
          {progress.needed > 0 ? (
            <span className="text-slate-400"> · {progress.needed} still needed</span>
          ) : null}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={applyTemplate}
        >
          Reset to firm template
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {byCategory.map((cat) => {
        const closed = isCollapsed(cat.id)
        return (
        <section
          key={cat.id}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div
            className={`flex items-center justify-between gap-2 px-4 py-2.5 ${INTAKE_CATEGORY_HEADER[cat.id]}`}
          >
            <button
              type="button"
              onClick={() => toggleCollapsed(cat.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              aria-expanded={!closed}
            >
              <ChevronDown
                className={`size-4 shrink-0 transition-transform ${closed ? '-rotate-90' : ''}`}
              />
              <h2 className="truncate text-sm font-semibold tracking-tight">
                {cat.label}
              </h2>
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">
                {cat.items.length}
              </span>
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startAdd(cat.id)}
              className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30 disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              Add
            </button>
          </div>
          {!closed && (
          <ul className="divide-y divide-slate-100">
            {cat.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <p
                  className={`min-w-0 flex-1 text-sm ${
                    item.status === 'na'
                      ? 'text-slate-400 line-through'
                      : item.status === 'received'
                        ? 'text-slate-700'
                        : 'font-medium text-slate-900'
                  }`}
                >
                  {item.label}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  {pendingDeleteId === item.id ? (
                    <>
                      <span className="mr-1 text-xs text-red-600">Remove?</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => confirmDelete(item.id)}
                      >
                        Delete
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={cancelDelete}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <StatusButton
                        label="Mark needed"
                        active={item.status === 'needed'}
                        disabled={pending}
                        onClick={() => setStatus(item.id, 'needed')}
                        className={
                          item.status === 'needed'
                            ? 'border-amber-200 bg-amber-50 text-amber-700 ring-amber-200'
                            : 'border-slate-200 text-slate-400'
                        }
                      >
                        <Circle className="size-3.5" />
                      </StatusButton>
                      <StatusButton
                        label="Mark received"
                        active={item.status === 'received'}
                        disabled={pending}
                        onClick={() => setStatus(item.id, 'received')}
                        className={
                          item.status === 'received'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'border-slate-200 text-slate-400'
                        }
                      >
                        <Check className="size-3.5" strokeWidth={2.5} />
                      </StatusButton>
                      <StatusButton
                        label="Mark not applicable"
                        active={item.status === 'na'}
                        disabled={pending}
                        onClick={() => setStatus(item.id, 'na')}
                        className={
                          item.status === 'na'
                            ? 'border-slate-300 bg-slate-100 text-slate-600 ring-slate-300'
                            : 'border-slate-200 text-slate-400'
                        }
                      >
                        <Minus className="size-3.5" />
                      </StatusButton>
                      <button
                        type="button"
                        aria-label="Remove item"
                        disabled={pending}
                        onClick={() => requestDelete(item.id)}
                        className="ml-1 flex size-8 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
            {cat.items.length === 0 && addingCategory !== cat.id && (
              <li className="px-4 py-3 text-xs text-slate-400">No items in this section</li>
            )}
            {addingCategory === cat.id && (
              <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <Input
                  autoFocus
                  value={draftLabel}
                  maxLength={200}
                  placeholder="New item…"
                  disabled={pending}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      confirmAdd(cat.id)
                    }
                    if (e.key === 'Escape') cancelAdd()
                  }}
                  className="h-8 min-w-[12rem] flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !draftLabel.trim()}
                  onClick={() => confirmAdd(cat.id)}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={cancelAdd}
                >
                  Cancel
                </Button>
              </li>
            )}
          </ul>
          )}
        </section>
        )
      })}
    </div>
  )
}
