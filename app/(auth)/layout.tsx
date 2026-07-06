import { SupabaseConfigBanner } from '@/components/auth/supabase-config-banner'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-8">
      <SupabaseConfigBanner />
      {children}
    </div>
  )
}
