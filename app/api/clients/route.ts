import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import { createClientWithOtp, listClients, refreshClientOtp } from '@/lib/supabase/clients'
import { sendClientOtpEmail } from '@/lib/email/resend'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { CreateClientSchema } from '@/lib/validations/client'
import { NextResponse } from 'next/server'

const OTP_SEND_WINDOW_MS = 60 * 60 * 1000

function portalUrl(portalToken: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/portal?token=${portalToken}`
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const firmId = await getFirmId()
    const clients = await listClients(firmId)
    return NextResponse.json({ clients })
  } catch (error) {
    console.error('GET /api/clients error:', error)
    return NextResponse.json({ error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const firmId = await getFirmId()
    const body = await request.json()
    const result = CreateClientSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const emailLimit = checkRateLimit(
      `otp-send:email:${result.data.email.toLowerCase()}`,
      3,
      OTP_SEND_WINDOW_MS
    )
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many OTP emails sent to this address. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const { client, otp, portalToken } = await createClientWithOtp(firmId, result.data)
    const emailResult = await sendClientOtpEmail({
      to: client.email,
      clientName: client.name,
      otp,
      portalUrl: portalUrl(portalToken),
    })

    return NextResponse.json({
      client,
      emailSent: !emailResult.devMode,
      ...(emailResult.devMode ? { devOtp: otp, portalUrl: portalUrl(portalToken) } : {}),
    })
  } catch (error) {
    console.error('POST /api/clients error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message.includes('duplicate') || message.includes('unique')) {
      return NextResponse.json(
        { error: 'A client with this email already exists.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Unable to add client. Please try again.', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
