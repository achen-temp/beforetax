import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { getCpaProfile } from '@/lib/supabase/cpa-users'
import { AccountProfileForm } from '@/components/cpa/account-profile-form'

/** Personal profile — edit name; email / role / firm are read-only. */
export default async function AccountPage() {
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

  const email = user.email ?? profile.email

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My account</h1>
      </div>

      <AccountProfileForm
        firstName={profile.firstName}
        lastName={profile.lastName}
        email={email}
        role={profile.role}
        firmName={firm.firmName}
      />
    </div>
  )
}
