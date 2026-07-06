import { TodoBanner, TodoBannerCode } from '@/components/ui/todo-banner'

export function SupabaseConfigBanner() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <TodoBanner title="Supabase Auth config (dev)" className="mb-6 w-full max-w-sm">
      <ul className="list-inside list-disc space-y-1">
        <li>
          Dashboard → <strong>Authentication → Providers → Email</strong> — turn
          off <strong>Confirm email</strong> for local dev
        </li>
        <li>
          Dashboard → <strong>URL Configuration</strong> — set Site URL to{' '}
          <TodoBannerCode>{appUrl}</TodoBannerCode> and add redirect{' '}
          <TodoBannerCode>/auth/callback</TodoBannerCode>
        </li>
        <li>
          Production — configure custom SMTP (Resend) + email templates so mail
          comes from your app, not Supabase
        </li>
      </ul>
    </TodoBanner>
  )
}
