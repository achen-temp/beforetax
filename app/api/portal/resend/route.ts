import { getClientByPortalToken, regenerateOtpForPortal } from '@/lib/supabase/clients'
import { getFirmNameById } from '@/lib/supabase/firms'
import { sendClientOtpEmail } from '@/lib/email/resend'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { getPortalPendingTokenFromCookies } from '@/lib/auth/client-token'
import { PortalResendSchema } from '@/lib/validations/client'
import { NextResponse } from 'next/server'

const OTP_SEND_WINDOW_MS = 60 * 60 * 1000

function portalUrl(portalToken: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/portal?token=${portalToken}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = PortalResendSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid portal link', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const token = parsed.data.token ?? (await getPortalPendingTokenFromCookies())
    if (!token) {
      return NextResponse.json(
        { error: 'Unable to resend code. Go back and enter your email again.', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const existing = await getClientByPortalToken(token)
    if (!existing) {
      return NextResponse.json(
        { error: 'Unable to resend code. Go back and enter your email again.', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const emailLimit = checkRateLimit(
      `otp-send:email:${existing.email.toLowerCase()}`,
      3,
      OTP_SEND_WINDOW_MS
    )
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many codes sent. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const { client, otp } = await regenerateOtpForPortal(existing.id, token)
    const firmName = (await getFirmNameById(client.firm_id)) ?? 'your CPA firm'
    const emailResult = await sendClientOtpEmail({
      to: client.email,
      clientName: client.name,
      otp,
      portalUrl: portalUrl(token),
      firmName,
    })

    return NextResponse.json({
      success: true,
      emailSent: !emailResult.devMode,
      firmName,
      ...(emailResult.devMode ? { devOtp: otp } : {}),
    })
  } catch (error) {
    console.error('POST /api/portal/resend error:', error)
    return NextResponse.json({ error: 'Unable to resend code', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
