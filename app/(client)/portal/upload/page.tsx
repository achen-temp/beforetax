import { redirect } from 'next/navigation'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { loadPortalSessionView } from '@/lib/supabase/portal-session'
import { PortalUploadDashboard } from '@/components/client/portal-upload-dashboard'

export default async function PortalUploadPage() {
  const session = await getClientSessionFromCookies()
  if (!session) redirect('/portal')

  const initialSession = await loadPortalSessionView(session.clientId, session.firmId)
  if (!initialSession) redirect('/portal')

  return <PortalUploadDashboard initialSession={initialSession} />
}
