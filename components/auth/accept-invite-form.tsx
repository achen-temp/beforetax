'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { mapLoginError } from '@/lib/auth/errors'
import { InviteAcceptSchema } from '@/lib/validations/auth'
import { PasswordRequirements } from '@/components/auth/password-requirements'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type InviteInfo = {
  email: string
  role: string
  firmName: string | null
}

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter()
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingInvite, setLoadingInvite] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadingInvite(true)
      try {
        const res = await fetch(`/api/invite/${encodeURIComponent(token)}`)
        const data = (await res.json()) as InviteInfo & { error?: string }
        if (!res.ok) {
          if (!cancelled) setLoadError(data.error ?? 'This invite link is invalid.')
          return
        }
        if (!cancelled) {
          setInvite({
            email: data.email,
            role: data.role,
            firmName: data.firmName ?? null,
          })
        }
      } catch {
        if (!cancelled) setLoadError('Unable to load invite. Please try again.')
      } finally {
        if (!cancelled) setLoadingInvite(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validation = InviteAcceptSchema.safeParse({
      firstName,
      lastName,
      password,
      confirmPassword,
    })
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/invite/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: validation.data.firstName,
          lastName: validation.data.lastName,
          password: validation.data.password,
          confirmPassword: validation.data.confirmPassword,
        }),
      })
      const data = (await res.json()) as { error?: string; email?: string }
      if (!res.ok) {
        setError(data.error ?? 'Unable to accept invite.')
        return
      }

      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email ?? invite?.email ?? '',
        password: validation.data.password,
      })

      if (signInError) {
        setError(mapLoginError(signInError))
        return
      }

      router.push('/clients')
      router.refresh()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (loadingInvite) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Loading invite…</CardTitle>
        </CardHeader>
      </Card>
    )
  }

  if (loadError || !invite) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invite unavailable</CardTitle>
          <CardDescription>{loadError ?? 'This invite link is invalid.'}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className="text-sm underline-offset-4 hover:underline">
            Go to sign in
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Join {invite.firmName ?? 'your firm'}</CardTitle>
        <CardDescription>
          Create your account for <strong>{invite.email}</strong> to join as {invite.role}.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                type="text"
                autoComplete="given-name"
                required
                disabled={loading}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                type="text"
                autoComplete="family-name"
                required
                disabled={loading}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordRequirements password={password} confirmPassword={confirmPassword} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              disabled={loading}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Joining…' : 'Accept invite'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
