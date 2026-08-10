import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import {
  createClientWithOtp,
  getClientStatusCounts,
  listClientSummaries,
  markClientOtpSent,
  type ClientSort,
  type ClientStatus,
} from '@/lib/supabase/clients'
import { sendClientOtpEmail } from '@/lib/email/resend'
import { checkRateLimit } from '@/lib/auth/rate-limit'
import { CreateClientSchema } from '@/lib/validations/client'
import { NextResponse } from 'next/server'

const OTP_SEND_WINDOW_MS = 60 * 60 * 1000

function portalUrl(portalToken: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base}/portal?token=${portalToken}`
}

const CLIENT_STATUSES: readonly ClientStatus[] = [
  'not_started',
  'needs_review',
  'in_progress',
  'complete',
]
const CLIENT_SORTS: readonly ClientSort[] = ['priority', 'recent', 'name', 'newest']
const PAGE_SIZE = 25

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const firmId = await getFirmId()
    const { searchParams } = new URL(request.url)

    const search = searchParams.get('search') ?? undefined
    const statusParam = searchParams.get('status')
    const status =
      statusParam && (CLIENT_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as ClientStatus)
        : 'all'
    const sortParam = searchParams.get('sort')
    const sort =
      sortParam && (CLIENT_SORTS as readonly string[]).includes(sortParam)
        ? (sortParam as ClientSort)
        : 'priority'
    const page = Math.max(1, Number(searchParams.get('page')) || 1)

    const [{ clients, total }, counts] = await Promise.all([
      listClientSummaries({ firmId, search, status, sort, page, limit: PAGE_SIZE }),
      getClientStatusCounts(firmId, search),
    ])

    return NextResponse.json({ clients, total, page, limit: PAGE_SIZE, counts })
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

    const { sendOtp, ...clientInput } = result.data

    if (sendOtp) {
      const emailLimit = checkRateLimit(
        `otp-send:email:${clientInput.email.toLowerCase()}`,
        3,
        OTP_SEND_WINDOW_MS
      )
      if (!emailLimit.allowed) {
        return NextResponse.json(
          {
            error: 'Too many OTP emails sent to this address. Please try again later.',
            code: 'RATE_LIMITED',
          },
          { status: 429 }
        )
      }
    }

    const { client, otp, portalToken } = await createClientWithOtp(firmId, clientInput)

    if (!sendOtp) {
      return NextResponse.json({ client, emailSent: false, otpSentAt: null })
    }

    const emailResult = await sendClientOtpEmail({
      to: client.email,
      clientName: client.name,
      otp,
      portalUrl: portalUrl(portalToken),
    })
    const otpSentAt = await markClientOtpSent(client.id, firmId)

    return NextResponse.json({
      client,
      emailSent: !emailResult.devMode,
      otpSentAt,
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
