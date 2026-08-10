import { redirect } from 'next/navigation'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { getClientTaxData } from '@/lib/supabase/tax-data'
import { resolvePortalTaxYear } from '@/lib/tax/portal-active-year'
import { findDocument, orderedDocuments } from '@/lib/tax/build-tax-data'
import { DocumentReview } from '@/components/tax/document-review'

export default async function PortalDocumentReviewPage({
  params,
}: {
  params: Promise<{ docId: string }>
}) {
  const { docId } = await params

  const session = await getClientSessionFromCookies()
  if (!session) redirect('/portal')

  const taxYear = await resolvePortalTaxYear({
    clientId: session.clientId,
    firmId: session.firmId,
  })
  const data = await getClientTaxData(session.clientId, session.firmId, taxYear.year)
  const doc = data ? findDocument(data, docId) : null
  if (!doc || !data) redirect('/portal/tax-data')

  const queue = orderedDocuments(data)
  const index = queue.findIndex((d) => d.id === docId)
  const reviewBase = '/portal/tax-data/review'
  const prevHref = index > 0 ? `${reviewBase}/${queue[index - 1].id}` : null
  const nextHref =
    index >= 0 && index < queue.length - 1 ? `${reviewBase}/${queue[index + 1].id}` : null

  return (
    <DocumentReview
      doc={doc}
      role="client"
      fileEndpoint={`/api/portal/documents/${docId}/file`}
      backHref="/portal/tax-data"
      backLabel="Back to tax data"
      prevHref={prevHref}
      nextHref={nextHref}
      position={{ index: index + 1, total: queue.length }}
    />
  )
}
