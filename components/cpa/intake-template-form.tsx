'use client'

import { useMemo, useState, useTransition } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveIntakeChecklistTemplate } from '@/app/(cpa)/settings/actions'
import {
  DEFAULT_INTAKE_TEMPLATE,
  INTAKE_CATEGORIES,
  INTAKE_CATEGORY_HEADER,
  newIntakeItemId,
  resolveIntakeTemplate,
  type IntakeCategoryId,
  type IntakeTemplateItem,
} from '@/lib/tax/intake-checklist'

/** Owner edits the firm-wide default applied when a client year uses “Apply checklist”. */
export function IntakeTemplateForm({
  savedTemplate,
}: {
  savedTemplate: IntakeTemplateItem[] | null
}) {
  const [items, setItems] = useState<IntakeTemplateItem[]>(() =>
    resolveIntakeTemplate(savedTemplate)
  )
  const [usingCustom, setUsingCustom] = useState(
    savedTemplate !== null && savedTemplate.length > 0
  )
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [addingCategory, setAddingCategory] = useState<IntakeCategoryId | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<IntakeCategoryId>>(() => new Set())

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

  function markDirty() {
    setUsingCustom(true)
    setDirty(true)
    setStatus('idle')
  }

  function requestDelete(id: string) {
    setPendingDeleteId(id)
    cancelAdd()
  }

  function cancelDelete() {
    setPendingDeleteId(null)
  }

  function confirmDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
    setPendingDeleteId(null)
    markDirty()
  }

  function startAdd(categoryId: IntakeCategoryId) {
    expandCategory(categoryId)
    setAddingCategory(categoryId)
    setDraftLabel('')
    setPendingDeleteId(null)
  }

  function cancelAdd() {
    setAddingCategory(null)
    setDraftLabel('')
  }

  function confirmAdd(categoryId: IntakeCategoryId) {
    const label = draftLabel.trim()
    if (!label) return
    setItems((prev) => [
      ...prev,
      { id: newIntakeItemId(), categoryId, label },
    ])
    markDirty()
    cancelAdd()
  }

  function restorePlatformDefault() {
    setItems(DEFAULT_INTAKE_TEMPLATE.map((i) => ({ ...i })))
    setUsingCustom(false)
    setDirty(true)
    setStatus('idle')
    cancelAdd()
    setPendingDeleteId(null)
  }

  function onSave() {
    setStatus('idle')
    setError(null)
    startTransition(async () => {
      const payload = usingCustom ? items : null
      const result = await saveIntakeChecklistTemplate(payload)
      if (!result.ok) {
        setStatus('error')
        setError(result.error)
        return
      }
      const next = resolveIntakeTemplate(result.template)
      setItems(next)
      setUsingCustom(result.template !== null && result.template.length > 0)
      setDirty(false)
      setStatus('saved')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax prep checklist template</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground" hidden>
          Default “what to bring” list for client tax years. Applying a checklist
          on a client copies this template.
        </p>

        <div className="max-h-[32rem] space-y-3 overflow-y-auto overscroll-contain pr-1">
          {byCategory.map((cat) => {
            const closed = isCollapsed(cat.id)
            return (
            <section
              key={cat.id}
              className="overflow-hidden rounded-xl border border-slate-200"
            >
              <div
                className={`flex items-center justify-between gap-2 px-3 py-2 ${INTAKE_CATEGORY_HEADER[cat.id]}`}
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
                  <h3 className="truncate text-sm font-semibold tracking-tight">
                    {cat.label}
                  </h3>
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
              <ul className="divide-y divide-slate-100 bg-white">
                {cat.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 text-sm text-slate-800">
                      {item.label}
                    </span>
                    {pendingDeleteId === item.id ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-xs text-red-600">Remove?</span>
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
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${item.label}`}
                        disabled={pending}
                        onClick={() => requestDelete(item.id)}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
                {cat.items.length === 0 && addingCategory !== cat.id && (
                  <li className="px-3 py-2 text-xs text-slate-400">No items yet</li>
                )}
                {addingCategory === cat.id && (
                  <li className="flex items-center gap-2 px-3 py-2">
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
                      className="h-8 flex-1"
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

        {items.length === 0 && (
          <p className="text-sm text-amber-700">
            Template is empty. Restore the platform default or clients won’t get
            any items when you apply a checklist.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button type="button" disabled={pending || !dirty} onClick={onSave}>
              {pending ? 'Saving…' : 'Save template'}
            </Button>
            <span className="min-h-4 text-sm" aria-live="polite">
              {status === 'saved' && <span className="text-emerald-600">Saved</span>}
              {status === 'error' && (
                <span className="text-destructive">
                  {error ?? 'Couldn’t save. Please try again.'}
                </span>
              )}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={restorePlatformDefault}
            className="border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
          >
            Restore platform default
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
