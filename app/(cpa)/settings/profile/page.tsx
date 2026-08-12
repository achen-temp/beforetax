import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { FirmProfileForm } from '@/components/cpa/firm-profile-form'

export default async function FirmSettingsProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  if (!firm) redirect('/login')

  return (
    <FirmProfileForm
      firmName={firm.firmName ?? ''}
      documentIntakeEmail={firm.firmEmail ?? ''}
      logoUrl={firm.logoUrl}
    />
  )
}
