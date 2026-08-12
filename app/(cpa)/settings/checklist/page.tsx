import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { getFirmSettings } from '@/lib/supabase/firm-settings'
import { IntakeTemplateForm } from '@/components/cpa/intake-template-form'

export default async function FirmSettingsChecklistPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  if (!firm) redirect('/login')

  const settings = await getFirmSettings(firm.firmId)

  return <IntakeTemplateForm savedTemplate={settings.intakeChecklistTemplate} />
}
