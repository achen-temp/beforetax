import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import { getFirmNameById } from '@/lib/supabase/firms'
import { markClientOtpSent, refreshClientOtp } from '@/lib/supabase/clients'
import { sendClientOtpEmail } from '@/lib/email/resend'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { NextResponse } from 'next/server'

const OTP_SEND_WINDOW_MS = 60 * 60 * 1000

function portalUrl(portalToken: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/portal?token=${portalToken}`
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const firmId = await getFirmId()
    const { client, otp, portalToken } = await refreshClientOtp(id, firmId)

    const emailLimit = checkRateLimit(
      `otp-send:email:${client.email.toLowerCase()}`,
      3,
      OTP_SEND_WINDOW_MS
    )
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many OTP emails sent. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const firmName = (await getFirmNameById(firmId)) ?? 'your CPA firm'
    const emailResult = await sendClientOtpEmail({
      to: client.email,
      clientName: client.name,
      otp,
      portalUrl: portalUrl(portalToken),
      firmName,
    })
    const otpSentAt = await markClientOtpSent(client.id, firmId)

    return NextResponse.json({
      success: true,
      emailSent: !emailResult.devMode,
      otpSentAt,
      ...(emailResult.devMode ? { devOtp: otp, portalUrl: portalUrl(portalToken) } : {}),
    })
  } catch (error) {
    console.error('POST /api/clients/[id]/send-otp error:', error)
    return NextResponse.json(
      { error: 'Unable to send OTP. Please try again.', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
