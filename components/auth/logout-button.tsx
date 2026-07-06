'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogout() {
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) {
        setError('Unable to sign out. Please try again.')
        return
      }

      router.push('/login')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button variant="outline" onClick={handleLogout} disabled={loading}>
        {loading ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  )
}
