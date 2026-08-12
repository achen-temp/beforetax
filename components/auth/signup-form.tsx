'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { mapLoginError } from '@/lib/auth/errors'
import { SignupFormSchema } from '@/lib/validations/auth'
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

export function SignupForm() {
  const router = useRouter()
  const [firmName, setFirmName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState<{
    email: string
    devConfirmUrl?: string
  } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validation = SignupFormSchema.safeParse({
      firmName,
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
    })

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmName: validation.data.firmName,
          firstName: validation.data.firstName,
          lastName: validation.data.lastName,
          email: validation.data.email,
          password: validation.data.password,
        }),
      })

      const data = (await res.json()) as {
        error?: string
        requiresEmailConfirmation?: boolean
        devConfirmUrl?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Unable to create account. Please try again.')
        return
      }

      if (data.requiresEmailConfirmation) {
        setCheckEmail({
          email: validation.data.email,
          devConfirmUrl: data.devConfirmUrl,
        })
        return
      }

      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
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

  if (checkEmail) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to <strong>{checkEmail.email}</strong>. Confirm
            your email to finish setting up your firm, then sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {checkEmail.devConfirmUrl && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Dev mode (no Resend key):{' '}
              <a
                href={checkEmail.devConfirmUrl}
                className="font-medium underline underline-offset-2"
              >
                open verification link
              </a>
            </p>
          )}
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Already verified?{' '}
            <Link
              href="/login?message=confirm_email"
              className="underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create CPA Account</CardTitle>
        <CardDescription>
          Register your firm to start collecting tax documents. You’ll need to verify
          your email before signing in.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="firmName">Firm Name</Label>
            <Input
              id="firmName"
              type="text"
              autoComplete="organization"
              required
              disabled={loading}
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
            />
          </div>
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
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
            <PasswordRequirements
              password={password}
              confirmPassword={confirmPassword}
            />
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
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            Joining an existing firm? Ask your firm owner for an invite — don’t create a
            new firm here.
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
