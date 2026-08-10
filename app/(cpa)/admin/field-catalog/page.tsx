import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FIELD_SCHEMAS } from '@/lib/tax/field-schemas'
import { FieldCatalog, type CatalogForm } from '@/components/cpa/field-catalog'

export default async function FieldCatalogPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const forms: CatalogForm[] = Object.values(FIELD_SCHEMAS)
    .filter((schema): schema is NonNullable<typeof schema> => Boolean(schema))
    // W-2 is the primary form — list it first, keep the rest in schema order.
    .sort((a, b) => (a.formType === 'w2' ? -1 : b.formType === 'w2' ? 1 : 0))
    .map((form) => ({
      formType: form.formType,
      label: form.label,
      fields: form.fields.map((field) => ({
        key: field.key,
        label: field.label,
        box: field.box ?? null,
        type: field.type,
        repeating: Boolean(field.repeating),
        slots: field.slots ?? null,
        reserved: Boolean(field.reserved),
      })),
    }))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Field catalog</h1>
      </div>

      <FieldCatalog forms={forms} />
    </div>
  )
}
