import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { getCpaProfile } from '@/lib/supabase/cpa-users'
import { CpaShell } from '@/components/cpa/cpa-shell'

/** Global chrome for every CPA route — one header (logo + nav + profile) and one
 * footer, so individual pages only render their own content. */
export default async function CpaLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [firm, profile] = await Promise.all([
    getFirmForUser(user.id),
    getCpaProfile(user.id),
  ])
  if (!firm || !profile) redirect('/login')

  return (
    <CpaShell
      user={{
        email: user.email ?? profile.email,
        firmName: firm.firmName,
        logoUrl: firm.logoUrl,
        role: firm.role,
        firstName: profile.firstName,
        lastName: profile.lastName,
      }}
    >
      {children}
    </CpaShell>
  )
}
