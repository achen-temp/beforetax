import { redirect } from 'next/navigation'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { TaxDataView } from '@/components/client/tax-data-view'

export default async function PortalTaxDataPage() {
  const session = await getClientSessionFromCookies()
  if (!session) redirect('/portal')

  return <TaxDataView />
}
