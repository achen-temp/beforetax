'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, HelpCircle, Lock, MailCheck, Shield } from 'lucide-react'
import { OtpInput } from '@/components/client/otp-input'
import { PortalBrandPanel } from '@/components/client/portal-brand-panel'
import { Button } from '@/components/ui/button'

const RESEND_COOLDOWN = 45

export function PortalOtpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [clientName, setClientName] = useState<string | null>(null)
  const [clientEmail, setClientEmail] = useState<string | null>(null)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendSeconds, setResendSeconds] = useState(RESEND_COOLDOWN)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    // No token means the client didn't arrive via their email link — a dedicated
    // guidance screen is shown instead of the code form (see below).
    if (!token) return

    fetch(`/api/portal?token=${token}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Invalid link')
        setClientName(data.name)
        setClientEmail(data.email)
      })
      .catch((e: Error) => setError(e.message))
  }, [token])

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = setInterval(() => setResendSeconds((s) => s - 1), 1000)
    return () => clearInterval(timer)
  }, [resendSeconds])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!token || otp.length !== 6) {
      setError('Please enter the 6-digit code')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/portal/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, otp }),
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
    if (!token || resendSeconds > 0) return
    setResending(true)
    setError(null)

    try {
      const res = await fetch('/api/portal/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
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

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200/60 px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 -top-20 size-80 rounded-full bg-[#0061FF]/8 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-blue-400/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/80 bg-white shadow-2xl shadow-slate-300/50 ring-1 ring-slate-900/5">
        <div className="grid lg:grid-cols-2">
          <PortalBrandPanel email={clientEmail ?? undefined} name={clientName ?? undefined} />

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
              <MailCheck className="size-8 text-[#0061FF]" />
              <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-[#0061FF] text-white">
                <Lock className="size-3" />
              </span>
            </div>
          </div>

          {token ? (
            <>
          <div className="mb-8 space-y-2 text-center">
            <h2 className="text-2xl font-bold text-slate-900">Enter verification code</h2>
            <p className="text-sm text-slate-500">
              {clientEmail ? (
                <>
                  We&apos;ve sent a 6-digit code to{' '}
                  <span className="font-medium text-[#0061FF]">{clientEmail}</span>
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
                disabled={resendSeconds > 0 || resending || !token}
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
              disabled={loading || otp.length !== 6 || !token}
              className="h-12 w-full rounded-xl bg-[#0061FF] text-base font-semibold hover:bg-[#0052d9]"
            >
              {loading ? 'Verifying…' : 'Verify & Continue'}
            </Button>

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
              onClick={handleResend}
              disabled={resendSeconds > 0 || resending || !token}
              className="h-12 w-full rounded-xl border-slate-200 text-base font-medium text-slate-700 hover:bg-slate-50"
            >
              <Shield className="mr-2 size-4 text-[#0061FF]" />
              Try another way
            </Button>
          </form>
            </>
          ) : (
            <div className="space-y-5 text-center">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-slate-900">Check your email</h2>
                <p className="text-sm text-slate-500">
                  Open the secure link we emailed you to continue — it signs you in and then asks
                  for your 6-digit code.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left text-sm text-slate-600">
                Didn&apos;t receive it, or your link expired? Contact your CPA and they&apos;ll
                resend your secure access link.
              </div>
              <Button asChild variant="outline" className="h-11 w-full rounded-xl border-slate-200">
                <Link href="/">Back to home</Link>
              </Button>
            </div>
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
  )
}
