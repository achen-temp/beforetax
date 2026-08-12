'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, HelpCircle, Lock, Mail, MailCheck, Shield } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { OtpInput } from '@/components/client/otp-input'
import { PortalBrandPanel } from '@/components/client/portal-brand-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const RESEND_COOLDOWN = 45

type Step = 'email' | 'otp'

export function PortalOtpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const linkToken = searchParams.get('token')

  const [step, setStep] = useState<Step>(linkToken ? 'otp' : 'email')
  const [email, setEmail] = useState('')
  const [clientName, setClientName] = useState<string | null>(null)
  const [clientEmail, setClientEmail] = useState<string | null>(null)
  const [firmName, setFirmName] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(linkToken ? RESEND_COOLDOWN : 0)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (!linkToken) return

    fetch(`/api/portal?token=${linkToken}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Invalid link')
        setClientName(data.name)
        setClientEmail(data.email)
        setFirmName(typeof data.firmName === 'string' ? data.firmName : null)
        setLogoUrl(typeof data.logoUrl === 'string' ? data.logoUrl : null)
        setStep('otp')
      })
      .catch((e: Error) => setError(e.message))
  }, [linkToken])

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = setInterval(() => setResendSeconds((s) => s - 1), 1000)
    return () => clearInterval(timer)
  }, [resendSeconds])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Please enter your email address')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unable to send code')

      setClientEmail(trimmed)
      setClientName(null)
      setFirmName(typeof data.firmName === 'string' ? data.firmName : null)
      setLogoUrl(typeof data.logoUrl === 'string' ? data.logoUrl : null)
      setOtp('')
      setStep('otp')
      setResendSeconds(RESEND_COOLDOWN)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send code')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== 6) {
      setError('Please enter the 6-digit code')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/portal/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp,
          ...(linkToken ? { token: linkToken } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Verification failed')

      router.push(data.redirect ?? '/portal/upload')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendSeconds > 0) return
    setResending(true)
    setError(null)

    try {
      const res = await fetch('/api/portal/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(linkToken ? { token: linkToken } : {}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unable to resend')

      setResendSeconds(RESEND_COOLDOWN)
      if (data.devOtp) {
        setError(`Dev mode: new code is ${data.devOtp}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to resend code')
    } finally {
      setResending(false)
    }
  }

  function goBackToEmail() {
    setStep('email')
    setOtp('')
    setError(null)
    setClientName(null)
    setFirmName(null)
    setLogoUrl(null)
    setResendSeconds(0)
  }

  const displayEmail = clientEmail ?? undefined
  const brandEmail = step === 'otp' ? displayEmail : undefined

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200/60">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-20 size-80 rounded-full bg-[#0061FF]/8 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-blue-400/10 blur-3xl" />
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-300/50 ring-1 ring-slate-900/5">
        <div className="grid lg:grid-cols-2">
          <PortalBrandPanel
            email={brandEmail}
            name={clientName ?? undefined}
            firmName={firmName}
            logoUrl={logoUrl}
          />

          <div className="flex flex-col border-t border-slate-100 bg-white px-6 py-8 sm:px-10 lg:border-t-0 lg:px-10 lg:py-10 xl:px-12">
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
              >
                <ChevronLeft className="size-4" />
                Back
              </Link>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
              >
                <HelpCircle className="size-4" />
                Need help?
              </button>
            </div>

            <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-6 lg:py-4">
              <div className="mb-8 flex justify-center">
                <div className="relative flex size-16 items-center justify-center rounded-full bg-blue-50">
                  {step === 'email' ? (
                    <Mail className="size-8 text-[#0061FF]" />
                  ) : (
                    <MailCheck className="size-8 text-[#0061FF]" />
                  )}
                  <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-[#0061FF] text-white">
                    <Lock className="size-3" />
                  </span>
                </div>
              </div>

              {step === 'email' ? (
                <>
                  <div className="mb-8 space-y-2 text-center">
                    <h2 className="text-2xl font-bold text-slate-900">Sign in with email</h2>
                    <p className="text-sm text-slate-500">
                      Enter the email your CPA firm has on file. We&apos;ll send a 6-digit
                      verification code.
                    </p>
                  </div>

                  <form onSubmit={handleEmailSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="portal-email" className="sr-only">
                        Email
                      </label>
                      <Input
                        id="portal-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        className="h-12 rounded-xl border-slate-200 text-base"
                      />
                    </div>

                    {error && (
                      <p className="text-center text-sm text-red-600" role="alert">
                        {error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      disabled={loading || !email.trim()}
                      className="h-12 w-full rounded-xl bg-[#0061FF] text-base font-semibold hover:bg-[#0052d9]"
                    >
                      {loading ? 'Sending…' : 'Send verification code'}
                    </Button>
                  </form>
                </>
              ) : (
                <>
                  <div className="mb-8 space-y-2 text-center">
                    <h2 className="text-2xl font-bold text-slate-900">Enter verification code</h2>
                    <p className="text-sm text-slate-500">
                      {displayEmail ? (
                        <>
                          We&apos;ve sent a 6-digit code to{' '}
                          <span className="font-medium text-[#0061FF]">{displayEmail}</span>
                        </>
                      ) : (
                        'Enter the 6-digit code from your email'
                      )}
                    </p>
                  </div>

                  <form onSubmit={handleVerify} className="space-y-6">
                    <OtpInput value={otp} onChange={setOtp} disabled={loading} />

                    {error && (
                      <p className="text-center text-sm text-red-600" role="alert">
                        {error}
                      </p>
                    )}

                    <p className="text-center text-sm text-slate-500">
                      Didn&apos;t receive the code?{' '}
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendSeconds > 0 || resending}
                        className="font-medium text-[#0061FF] disabled:opacity-50"
                      >
                        {resending
                          ? 'Sending…'
                          : resendSeconds > 0
                            ? `Resend code (${String(Math.floor(resendSeconds / 60)).padStart(2, '0')}:${String(resendSeconds % 60).padStart(2, '0')})`
                            : 'Resend code'}
                      </button>
                    </p>

                    <Button
                      type="submit"
                      disabled={loading || otp.length !== 6}
                      className="h-12 w-full rounded-xl bg-[#0061FF] text-base font-semibold hover:bg-[#0052d9]"
                    >
                      {loading ? 'Verifying…' : 'Verify & Continue'}
                    </Button>

                    {!linkToken && (
                      <>
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-200" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-slate-400">or</span>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={goBackToEmail}
                          className="h-12 w-full rounded-xl border-slate-200 text-base font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Shield className="mr-2 size-4 text-[#0061FF]" />
                          Use a different email
                        </Button>
                      </>
                    )}
                  </form>
                </>
              )}

              <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Lock className="size-3.5" />
                This helps us protect your account from unauthorized access.
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <div className="relative">
        <SiteFooter poweredBy />
      </div>
    </div>
  )
}
