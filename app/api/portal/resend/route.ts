import { getClientByPortalToken, regenerateOtpForPortal } from '@/lib/supabase/clients'
import { sendClientOtpEmail } from '@/lib/email/resend'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { PortalTokenSchema } from '@/lib/validations/client'
import { NextResponse } from 'next/server'

const OTP_SEND_WINDOW_MS = 60 * 60 * 1000

function portalUrl(portalToken: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/portal?token=${portalToken}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = PortalTokenSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid portal link', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const existing = await getClientByPortalToken(parsed.data.token)
    if (!existing) {
      return NextResponse.json({ error: 'Invalid portal link', code: 'NOT_FOUND' }, { status: 404 })
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

    const { client, otp } = await regenerateOtpForPortal(existing.id, parsed.data.token)
    const emailResult = await sendClientOtpEmail({
      to: client.email,
      clientName: client.name,
      otp,
      portalUrl: portalUrl(parsed.data.token),
    })

    return NextResponse.json({
      success: true,
      emailSent: !emailResult.devMode,
      ...(emailResult.devMode ? { devOtp: otp } : {}),
    })
  } catch (error) {
    console.error('POST /api/portal/resend error:', error)
    return NextResponse.json({ error: 'Unable to resend code', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
