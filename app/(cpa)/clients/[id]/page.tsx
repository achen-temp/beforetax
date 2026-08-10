import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ListChecks } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { getClientById } from '@/lib/supabase/clients'
import { getClientTaxData } from '@/lib/supabase/tax-data'
import { listPickerTaxYears, resolveTaxYear } from '@/lib/supabase/tax-years'
import { orderedDocuments } from '@/lib/tax/build-tax-data'
import { parseTaxYearParam } from '@/lib/tax/parse-tax-year'
import { TaxDataSections } from '@/components/tax/tax-data-sections'
import { TaxYearSelect } from '@/components/tax/tax-year-select'

export default async function ClientDetailPage({
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
  const data = await getClientTaxData(id, firm.firmId, taxYear.year)
  const firstDocId = data ? orderedDocuments(data)[0]?.id : undefined
  const yearQs = `?year=${taxYear.year}`

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="size-4" />
        All clients
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{client.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{client.email}</p>
          <div className="mt-3">
            <TaxYearSelect
              mode="cpa"
              pathname={`/clients/${id}`}
              years={years}
              value={taxYear.year}
            />
          </div>
        </div>
        {firstDocId && (
          <Link
            href={`/clients/${id}/review/${firstDocId}${yearQs}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <ListChecks className="size-4" />
            Review all
          </Link>
        )}
      </div>

      {data ? (
        <TaxDataSections data={data} role="cpa" clientId={id} year={taxYear.year} />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          This client has no documents for the {taxYear.year} tax year yet.
        </div>
      )}
    </div>
  )
}
