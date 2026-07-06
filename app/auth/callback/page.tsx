import { Suspense } from 'react'
import AuthCallbackPage from './page.client'

export default function AuthCallbackRoute() {
  return (
    <Suspense fallback={<div className="flex min-h-full items-center justify-center p-8 text-sm text-muted-foreground">Signing you in…</div>}>
      <AuthCallbackPage />
    </Suspense>
  )
}
