import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { getFirmSettings } from '@/lib/supabase/firm-settings'
import { SettingsForm } from '@/components/cpa/settings-form'

export default async function FirmSettingsUploadsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  if (!firm) redirect('/login')

  const settings = await getFirmSettings(firm.firmId)

  return <SettingsForm settings={settings} />
}
