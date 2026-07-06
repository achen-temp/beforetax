'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { safeRedirect } from '@/lib/auth/safe-redirect'

export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('Signing you in…')

  useEffect(() => {
    async function handleCallback() {
      const supabase = createClient()
      const redirect = safeRedirect(searchParams.get('redirect'))
      const code = searchParams.get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          router.replace(redirect)
          router.refresh()
          return
        }
      }

      const hash = window.location.hash.slice(1)
      if (hash) {
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (!error) {
            router.replace(redirect)
            router.refresh()
            return
          }
        }
      }

      setMessage('Unable to sign in. Redirecting to login…')
      router.replace('/login?error=auth_callback_failed')
    }

    handleCallback()
  }, [router, searchParams])

  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
