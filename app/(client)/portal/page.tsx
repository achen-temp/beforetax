import { Suspense } from 'react'
import { PortalOtpForm } from '@/components/client/portal-otp-form'

export default function PortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          Loading portal…
        </div>
      }
    >
      <PortalOtpForm />
    </Suspense>
  )
}
