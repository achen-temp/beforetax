import { redirect } from 'next/navigation'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { PortalUploadDashboard } from '@/components/client/portal-upload-dashboard'

export default async function PortalUploadPage() {
  const session = await getClientSessionFromCookies()
  if (!session) redirect('/portal')

  return <PortalUploadDashboard />
}
