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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validation = SignupFormSchema.safeParse({
      firmName,
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
          email: validation.data.email,
          password: validation.data.password,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Unable to create account. Please try again.')
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

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create CPA Account</CardTitle>
        <CardDescription>
          Register your firm to start collecting tax documents.
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
        </CardFooter>
      </form>
    </Card>
  )
}
