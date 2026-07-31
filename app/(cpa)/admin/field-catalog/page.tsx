import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FIELD_SCHEMAS } from '@/lib/tax/field-schemas'

export default async function FieldCatalogPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const forms = Object.values(FIELD_SCHEMAS).filter(
    (schema): schema is NonNullable<typeof schema> => Boolean(schema)
  )

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <div className="space-y-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Field catalog</h1>
        <p className="text-sm text-muted-foreground">
          Canonical fields extracted for each tax form. Defined in code
          (<code className="rounded bg-muted px-1 py-0.5 text-xs">lib/tax/field-schemas.ts</code>).
          Read-only.
        </p>
      </div>

      <div className="space-y-6">
        {forms.map((form) => (
          <section
            key={form.formType}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">{form.label}</h2>
                <p className="text-xs text-muted-foreground">
                  <code>{form.formType}</code> · {form.fields.length} fields
                </p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Field key</th>
                  <th className="px-5 py-2 font-medium">Label</th>
                  <th className="px-5 py-2 font-medium">Box</th>
                  <th className="px-5 py-2 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {form.fields.map((field) => (
                  <tr key={field.key} className="border-b border-border/50 last:border-0">
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
                    </td>
                    <td className="px-5 py-2 text-muted-foreground">{field.label}</td>
                    <td className="px-5 py-2 text-muted-foreground">{field.box ?? '—'}</td>
                    <td className="px-5 py-2 text-muted-foreground">{field.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  )
}
