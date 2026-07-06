import {
  clearClientOtp,
  getClientByPortalToken,
  getClientOtpCredentials,
} from '@/lib/supabase/clients'
import { verifyOtp } from '@/lib/auth/otp'
import {
  createClientToken,
  setClientSessionCookie,
} from '@/lib/auth/client-token'
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit'
import { VerifyOtpSchema } from '@/lib/validations/client'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const ipLimit = checkRateLimit(`portal-verify:ip:${ip}`, 10, 15 * 60 * 1000)
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait and try again.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const result = VerifyOtpSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const client = await getClientByPortalToken(result.data.token)
    if (!client) {
      return NextResponse.json({ error: 'Invalid portal link', code: 'NOT_FOUND' }, { status: 404 })
    }

    const credentials = await getClientOtpCredentials(client.id)
    if (!credentials?.otp_token) {
      return NextResponse.json(
        { error: 'This code has already been used. Ask your CPA for a new link.', code: 'OTP_USED' },
        { status: 400 }
      )
    }

    if (credentials.otp_expires_at && new Date(credentials.otp_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Access code expired', code: 'EXPIRED' }, { status: 410 })
    }

    const valid = await verifyOtp(result.data.otp, credentials.otp_token)
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect verification code', code: 'INVALID_OTP' }, { status: 401 })
    }

    await clearClientOtp(client.id)

    const jwt = await createClientToken(client.id, client.firm_id)
    const response = NextResponse.json({ success: true, redirect: '/portal/upload' })
    setClientSessionCookie(response, jwt)
    return response
  } catch (error) {
    console.error('POST /api/portal/verify error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
