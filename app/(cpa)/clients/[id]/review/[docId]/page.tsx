import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { getClientById } from '@/lib/supabase/clients'
import { getClientTaxData } from '@/lib/supabase/tax-data'
import { resolveTaxYear } from '@/lib/supabase/tax-years'
import { findDocument, orderedDocuments } from '@/lib/tax/build-tax-data'
import { parseTaxYearParam } from '@/lib/tax/parse-tax-year'
import { DocumentReview } from '@/components/tax/document-review'

export default async function ClientDocumentReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>
  searchParams: Promise<{ year?: string }>
}) {
  const { id, docId } = await params
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
  const data = await getClientTaxData(id, firm.firmId, taxYear.year)
  const doc = data ? findDocument(data, docId) : null
  if (!doc || !data) notFound()

  const queue = orderedDocuments(data)
  const index = queue.findIndex((d) => d.id === docId)
  const yearQs = `?year=${taxYear.year}`
  const reviewBase = `/clients/${id}/review`
  const prevHref = index > 0 ? `${reviewBase}/${queue[index - 1].id}${yearQs}` : null
  const nextHref =
    index >= 0 && index < queue.length - 1
      ? `${reviewBase}/${queue[index + 1].id}${yearQs}`
      : null

  return (
    <DocumentReview
      doc={doc}
      role="cpa"
      clientId={id}
      fileEndpoint={`/api/cpa/documents/${docId}/file`}
      verifyAllEndpoint={`/api/cpa/documents/${docId}/verify`}
      backHref={`/clients/${id}${yearQs}`}
      backLabel={`Back to ${client.name}`}
      prevHref={prevHref}
      nextHref={nextHref}
      position={{ index: index + 1, total: queue.length }}
    />
  )
}
