import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { getClientById } from '@/lib/supabase/clients'
import { getIntakeChecklist } from '@/lib/supabase/intake-checklist'
import { listPickerTaxYears, resolveTaxYear } from '@/lib/supabase/tax-years'
import { parseTaxYearParam } from '@/lib/tax/parse-tax-year'
import { TaxYearSelect } from '@/components/tax/tax-year-select'
import { IntakeChecklistPanel } from '@/components/cpa/intake-checklist-panel'
import type { IntakeChecklistItem } from '@/lib/tax/intake-checklist'

/** CPA-only intake checklist for a client tax year — separate from tax data. */
export default async function ClientIntakeChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ year?: string }>
}) {
  const { id } = await params
  const { year: yearRaw } = await searchParams
  const requestedYear = parseTaxYearParam(yearRaw)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  if (!firm) redirect('/login')

  const client = await getClientById(id, firm.firmId)
  if (!client) notFound()

  const taxYear = await resolveTaxYear({
    clientId: id,
    firmId: firm.firmId,
    requestedYear,
  })
  const years = await listPickerTaxYears(id, firm.firmId)

  let items: IntakeChecklistItem[] = []
  let loadError: string | null = null
  try {
    const checklist = await getIntakeChecklist({
      clientId: id,
      firmId: firm.firmId,
      year: taxYear.year,
    })
    items = checklist.items
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Unable to load checklist.'
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/clients/${id}?year=${taxYear.year}`}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="size-4" />
        Back to {client.name}
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Tax prep checklist
          </h1>
          <p className="mt-1 text-sm text-slate-500">{client.name}</p>
          <div className="mt-3">
            <TaxYearSelect
              mode="cpa"
              pathname={`/clients/${id}/checklist`}
              years={years}
              value={taxYear.year}
            />
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          {loadError}
        </div>
      ) : (
        <IntakeChecklistPanel
          clientId={id}
          year={taxYear.year}
          initialItems={items}
        />
      )}
    </div>
  )
}
