import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { CpaShell } from '@/components/cpa/cpa-shell'

/** Global chrome for every CPA route — one header (logo + nav + profile) and one
 * footer, so individual pages only render their own content. */
export default async function CpaLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)

  return (
    <CpaShell user={{ email: user.email ?? '', firmName: firm?.firmName ?? null }}>
      {children}
    </CpaShell>
  )
}
