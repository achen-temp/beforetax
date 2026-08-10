import {
  CheckCircle2,
  Clock3,
  Lock,
} from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { PortalSecurityIllustration } from '@/components/client/portal-security-illustration'
import { PLATFORM_NAME } from '@/lib/brand'

export function PortalBrandPanel({
  email,
  name,
}: {
  email?: string
  name?: string
}) {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 p-6 sm:p-8 lg:min-h-[640px] lg:p-10 lg:pr-8">
      <div>
        <BrandLogo />
      </div>

      <div className="mt-6 space-y-6 lg:mt-0 lg:space-y-8">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold leading-tight text-slate-900 lg:text-3xl xl:text-4xl">
            Secure access to your account
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-slate-600">
            {email ? (
              <>
                We&apos;ve sent a 6-digit verification code to{' '}
                <span className="font-medium text-[#0061FF]">{email}</span>
                {name ? ` for ${name}` : ''}.
              </>
            ) : (
              'Enter the email your CPA has on file to get a verification code and upload tax documents securely.'
            )}
          </p>
        </div>

        <PortalSecurityIllustration />

        <ul className="hidden space-y-4 text-sm text-slate-600 lg:block">
          <li className="flex gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-[#0061FF]" />
            <span>
              <strong className="text-slate-900">Your security is our priority</strong> — bank-level
              encryption protects your documents.
            </span>
          </li>
          <li className="flex gap-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <span>
              <strong className="text-slate-900">Secure & private</strong> — we never share your data
              with third parties.
            </span>
          </li>
          <li className="flex gap-3">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-violet-500" />
            <span>
              <strong className="text-slate-900">Quick & easy</strong> — enter the code from your
              email to continue.
            </span>
          </li>
        </ul>
      </div>

      <p className="mt-6 hidden text-xs text-slate-400 lg:mt-0 lg:block">© {PLATFORM_NAME}</p>
    </div>
  )
}
