import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { LogoutButton } from '@/components/auth/logout-button'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  const firmName = firm?.firmName ?? 'your firm'

  return (
    <div className="flex min-h-full flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {firmName}
          </h1>
          <p className="mt-2 text-muted-foreground">{user.email}</p>
          <div className="mt-4 flex gap-3">
            <a
              href="/clients"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Manage clients
            </a>
            <a
              href="/admin/field-catalog"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
            >
              Field catalog
            </a>
          </div>
        </div>
        <LogoutButton />
      </div>
    </div>
  )
}
