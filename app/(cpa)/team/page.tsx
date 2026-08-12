import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { listFirmMembers } from '@/lib/supabase/cpa-users'
import { listPendingInvites } from '@/lib/supabase/firm-invites'
import { TeamPanel } from '@/components/cpa/team-panel'

export default async function TeamPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  if (!firm) redirect('/login')

  if (firm.role !== 'owner') {
    redirect('/account')
  }

  const [members, invites] = await Promise.all([
    listFirmMembers(firm.firmId),
    listPendingInvites(firm.firmId),
  ])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Invite colleagues and manage who can access {firm.firmName ?? 'this firm'}.
        </p>
      </div>

      <TeamPanel members={members} invites={invites} currentUserId={user.id} />
    </div>
  )
}
