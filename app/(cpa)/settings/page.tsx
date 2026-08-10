import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { getFirmSettings } from '@/lib/supabase/firm-settings'
import { SettingsForm } from '@/components/cpa/settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  if (!firm) redirect('/login')

  const settings = await getFirmSettings(firm.firmId)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          {firm.firmName ?? 'Your firm'} · account preferences
        </p>
      </div>

      <SettingsForm settings={settings} />
    </div>
  )
}
