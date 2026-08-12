import { redirect } from 'next/navigation'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { loadPortalSessionView } from '@/lib/supabase/portal-session'
import { TaxDataView } from '@/components/client/tax-data-view'

export default async function PortalTaxDataPage() {
  const session = await getClientSessionFromCookies()
  if (!session) redirect('/portal')

  const initialSession = await loadPortalSessionView(session.clientId, session.firmId)
  if (!initialSession) redirect('/portal')

  return <TaxDataView initialSession={initialSession} />
}
