import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { FirmSettingsNav } from '@/components/cpa/firm-settings-nav'

/** Owner-only firm settings shell with secondary left nav. */
export default async function FirmSettingsLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  if (!firm) redirect('/login')
  if (firm.role !== 'owner') redirect('/account')

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Firm settings</h1>
      </div>

      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        <aside className="w-full shrink-0 md:sticky md:top-6 md:w-52">
          <FirmSettingsNav />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
