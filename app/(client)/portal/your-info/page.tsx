import { redirect } from 'next/navigation'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { loadPortalSessionView } from '@/lib/supabase/portal-session'
import { YourInfoForm } from '@/components/client/your-info-form'

export default async function PortalYourInfoPage() {
  const session = await getClientSessionFromCookies()
  if (!session) redirect('/portal')

  const initialSession = await loadPortalSessionView(session.clientId, session.firmId)
  if (!initialSession) redirect('/portal')

  return <YourInfoForm initialSession={initialSession} />
}
