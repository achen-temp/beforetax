import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOwnerProfile } from '@/lib/supabase/cpa-users'
import { createFirmInvite } from '@/lib/supabase/firm-invites'
import { getFirmForUser } from '@/lib/supabase/firms'
import { sendFirmInviteEmail } from '@/lib/email/resend'
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit'
import { TeamInviteSchema } from '@/lib/validations/auth'

const INVITE_LIMIT = 20
const INVITE_WINDOW_MS = 60 * 60 * 1000

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    const ipLimit = checkRateLimit(`team-invite:ip:${ip}`, INVITE_LIMIT, INVITE_WINDOW_MS)
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many invites. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    let owner
    try {
      owner = await requireOwnerProfile(user.id)
    } catch {
      return NextResponse.json(
        { error: 'Only the firm owner can invite teammates.', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = TeamInviteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Invalid input',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      )
    }

    const email = parsed.data.email.trim().toLowerCase()
    if (email === (user.email ?? '').toLowerCase() || email === owner.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'You can’t invite yourself.', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const firm = await getFirmForUser(user.id)
    const { invite, token } = await createFirmInvite({
      firmId: owner.firmId,
      email,
      role: parsed.data.role,
      invitedBy: owner.userId,
    })

    const inviteUrl = `${appBaseUrl()}/invite/${token}`
    const { devMode } = await sendFirmInviteEmail({
      to: email,
      firmName: firm?.firmName ?? 'your firm',
      inviterEmail: user.email ?? owner.email,
      role: parsed.data.role,
      inviteUrl,
    })

    return NextResponse.json({
      success: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expires_at: invite.expires_at,
        created_at: invite.created_at,
      },
      ...(devMode ? { devInviteUrl: inviteUrl } : {}),
    })
  } catch (error) {
    console.error('POST /api/cpa/team/invite error:', error)
    const message = error instanceof Error ? error.message : 'Unable to send invite.'
    const status = /already|migration|set up/i.test(message) ? 400 : 500
    return NextResponse.json(
      { error: message, code: status === 400 ? 'INVITE_FAILED' : 'SERVER_ERROR' },
      { status }
    )
  }
}
