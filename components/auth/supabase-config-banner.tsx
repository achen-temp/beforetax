import { TodoBanner, TodoBannerCode } from '@/components/ui/todo-banner'

export function SupabaseConfigBanner() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <TodoBanner title="Supabase Auth config (dev)" className="mb-6 w-full max-w-sm">
      <ul className="list-inside list-disc space-y-1">
        <li>
          Dashboard → <strong>Authentication → Providers → Email</strong> — keep{' '}
          <strong>Confirm email</strong> on for production-like signup (verification
          mail is sent via Resend)
        </li>
        <li>
          Local shortcut — set <TodoBannerCode>CPA_SKIP_EMAIL_CONFIRM=true</TodoBannerCode>{' '}
          in <TodoBannerCode>.env.local</TodoBannerCode> to skip verification
        </li>
        <li>
          Dashboard → <strong>URL Configuration</strong> — set Site URL to{' '}
          <TodoBannerCode>{appUrl}</TodoBannerCode> and add redirect{' '}
          <TodoBannerCode>/auth/callback</TodoBannerCode>
        </li>
        <li>
          Production — set <TodoBannerCode>RESEND_API_KEY</TodoBannerCode> (+ optional{' '}
          <TodoBannerCode>RESEND_FROM_EMAIL</TodoBannerCode>) for CPA verify + team
          invite emails
        </li>
      </ul>
    </TodoBanner>
  )
}
