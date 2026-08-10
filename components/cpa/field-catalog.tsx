'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CatalogField {
  key: string
  label: string
  box: string | null
  type: string
  repeating: boolean
  slots: string[] | null
  reserved: boolean
}

export interface CatalogForm {
  formType: string
  label: string
  fields: CatalogField[]
}

function matchesField(field: CatalogField, q: string): boolean {
  return (
    field.key.toLowerCase().includes(q) ||
    field.label.toLowerCase().includes(q) ||
    (field.box ?? '').toLowerCase().includes(q) ||
    field.type.toLowerCase().includes(q)
  )
}

export function FieldCatalog({ forms }: { forms: CatalogForm[] }) {
  const [query, setQuery] = useState('')
  // W-2 (the first form) is expanded by default; the rest start collapsed.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    forms[0] ? { [forms[0].formType]: true } : {}
  )

  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  const results = useMemo(() => {
    if (!searching) return forms.map((form) => ({ form, fields: form.fields }))
    return forms
      .map((form) => {
        const formMatch =
          form.label.toLowerCase().includes(q) || form.formType.toLowerCase().includes(q)
        const fields = formMatch ? form.fields : form.fields.filter((f) => matchesField(f, q))
        return { form, fields }
      })
      .filter((entry) => entry.fields.length > 0)
  }, [forms, q, searching])

  function toggle(formType: string) {
    setOpen((prev) => ({ ...prev, [formType]: !prev[formType] }))
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by box, field key, label, or type…"
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25"
        />
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          No fields match <span className="font-medium text-foreground">“{query}”</span>.
        </div>
      ) : (
        <div className="space-y-4">
          {results.map(({ form, fields }) => {
            const isOpen = searching || Boolean(open[form.formType])
            return (
              <section
                key={form.formType}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => toggle(form.formType)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 bg-slate-50 px-5 py-3 text-left transition-colors hover:bg-slate-100"
                >
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{form.label}</h2>
                    <p className="text-xs text-muted-foreground">
                      <code>{form.formType}</code> · {fields.length}
                      {searching ? ` of ${form.fields.length}` : ''} fields
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180'
                    )}
                  />
                </button>

                {isOpen && (
                  <table className="w-full border-t border-border text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                        <th className="px-5 py-2 font-medium">Box</th>
                        <th className="px-5 py-2 font-medium">Field key</th>
                        <th className="px-5 py-2 font-medium">Label</th>
                        <th className="px-5 py-2 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field) => (
                        <tr key={field.key} className="border-b border-border/50 last:border-0">
                          <td className="px-5 py-2 text-muted-foreground">{field.box ?? '—'}</td>
                          <td className="px-5 py-2 font-mono text-xs text-foreground">
                            {field.key}
                            {field.repeating && (
                              <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700">
                                repeating
                              </span>
                            )}
                            {field.slots && (
                              <span className="ml-1 rounded bg-sky-50 px-1 text-[10px] text-sky-700">
                                slots {field.slots.join('/')}
                              </span>
                            )}
                            {field.reserved && (
                              <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                                reserved
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-2 text-muted-foreground">{field.label}</td>
                          <td className="px-5 py-2 text-muted-foreground">{field.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
