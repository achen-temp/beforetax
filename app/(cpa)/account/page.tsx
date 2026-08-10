import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, Building2, Mail, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firm = await getFirmForUser(user.id)
  const { data: profile } = await supabase
    .from('cpa_users')
    .select('role, email')
    .eq('id', user.id)
    .single()

  const email = user.email ?? profile?.email ?? ''
  const role = profile?.role ?? 'staff'
  const firmName = firm?.firmName ?? null
  const initial = (firmName?.trim()?.[0] ?? email.trim()[0] ?? '?').toUpperCase()

  const rows = [
    { label: 'Email', value: email, Icon: Mail },
    { label: 'Role', value: role.charAt(0).toUpperCase() + role.slice(1), Icon: ShieldCheck },
    { label: 'Firm', value: firmName ?? '—', Icon: Building2 },
  ]

  return (
    <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profile &amp; account</h1>
          <p className="mt-1 text-sm text-slate-500">Your account details and firm access.</p>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-full bg-[#0061FF] text-xl font-semibold text-white">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-slate-900">{firmName ?? 'Your firm'}</p>
              <p className="truncate text-sm text-slate-500">{email}</p>
            </div>
          </div>

          <dl className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center gap-3 px-4 py-3">
                <row.Icon className="size-4 shrink-0 text-slate-400" />
                <dt className="w-24 shrink-0 text-sm text-slate-500">{row.label}</dt>
                <dd className="min-w-0 flex-1 truncate text-right text-sm font-medium text-slate-900">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <Link
          href="/settings"
          className="group mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Firm settings</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Manage firm-wide preferences like duplicate-upload handling.
            </p>
          </div>
          <ArrowUpRight className="size-5 shrink-0 text-slate-300 transition-colors group-hover:text-[#0061FF]" />
        </Link>
      </div>
  )
}
