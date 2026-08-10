import { startPortalLoginByEmail } from '@/lib/supabase/clients'
import { sendClientOtpEmail } from '@/lib/email/resend'
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit'
import { setPortalPendingCookie } from '@/lib/auth/client-token'
import { PortalLoginEmailSchema } from '@/lib/validations/client'
import { NextResponse } from 'next/server'

const OTP_SEND_WINDOW_MS = 60 * 60 * 1000

function portalUrl(portalToken: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/portal?token=${portalToken}`
}

/**
 * Email → OTP portal login. Always returns the same success payload whether or
 * not the email exists (anti-enumeration). When a client is found, sets an
 * httpOnly pending cookie used by verify/resend.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const ipLimit = checkRateLimit(`portal-login:ip:${ip}`, 10, OTP_SEND_WINDOW_MS)
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const parsed = PortalLoginEmailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid email', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const email = parsed.data.email.toLowerCase().trim()
    const emailLimit = checkRateLimit(`otp-send:email:${email}`, 3, OTP_SEND_WINDOW_MS)
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many codes sent. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const started = await startPortalLoginByEmail(email)

    // Identical public response whether or not the client exists.
    if (!started) {
      return NextResponse.json({
        success: true,
        message: 'If that email is on file, we sent a verification code.',
      })
    }

    await sendClientOtpEmail({
      to: started.client.email,
      clientName: started.client.name,
      otp: started.otp,
      portalUrl: portalUrl(started.portalToken),
    })

    // Same JSON shape as the "not found" path — cookie is the only difference
    // (httpOnly, not visible to JS). OTP is logged server-side in dev.
    const response = NextResponse.json({
      success: true,
      message: 'If that email is on file, we sent a verification code.',
    })
    setPortalPendingCookie(response, started.portalToken)
    return response
  } catch (error) {
    console.error('POST /api/portal/login error:', error)
    return NextResponse.json({ error: 'Unable to send code', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
