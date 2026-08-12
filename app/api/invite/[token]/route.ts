import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapSignupError } from '@/lib/auth/errors'
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit'
import { acceptFirmInvite, getInviteByToken } from '@/lib/supabase/firm-invites'
import { InviteAcceptSchema } from '@/lib/validations/auth'

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params
    const invite = await getInviteByToken(token)

    if (!invite) {
      return NextResponse.json(
        { error: 'This invite link is invalid.', code: 'INVITE_NOT_FOUND' },
        { status: 404 }
      )
    }

    if (invite.accepted_at) {
      return NextResponse.json(
        { error: 'This invite has already been used.', code: 'INVITE_USED' },
        { status: 410 }
      )
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'This invite has expired.', code: 'INVITE_EXPIRED' },
        { status: 410 }
      )
    }

    return NextResponse.json({
      email: invite.email,
      role: invite.role,
      firmName: invite.firm_name,
      expiresAt: invite.expires_at,
    })
  } catch (error) {
    console.error('GET /api/invite/[token] error:', error)
    return NextResponse.json(
      { error: 'Unable to load invite.', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, context: RouteContext) {
  let authUserId: string | null = null

  try {
    const { token } = await context.params
    const ip = getClientIp(request)
    const limit = checkRateLimit(`invite-accept:ip:${ip}`, 10, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const invite = await getInviteByToken(token)
    if (!invite) {
      return NextResponse.json(
        { error: 'This invite link is invalid.', code: 'INVITE_NOT_FOUND' },
        { status: 404 }
      )
    }
    if (invite.accepted_at) {
      return NextResponse.json(
        { error: 'This invite has already been used.', code: 'INVITE_USED' },
        { status: 410 }
      )
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'This invite has expired.', code: 'INVITE_EXPIRED' },
        { status: 410 }
      )
    }

    const body = await request.json()
    const parsed = InviteAcceptSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? 'Invalid input',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Invite link is the email proof — confirm immediately so they can sign in.
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: invite.email,
      password: parsed.data.password,
      email_confirm: true,
    })

    if (authError) {
      console.error('Invite accept auth error:', authError)
      return NextResponse.json(
        { error: mapSignupError(authError), code: 'ACCEPT_FAILED' },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Unable to create account. Please try again.', code: 'ACCEPT_FAILED' },
        { status: 500 }
      )
    }

    authUserId = authData.user.id

    await acceptFirmInvite({
      token,
      userId: authUserId,
      email: invite.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    })

    return NextResponse.json({
      success: true,
      email: invite.email,
    })
  } catch (error) {
    console.error('POST /api/invite/[token] error:', error)

    if (authUserId) {
      try {
        const admin = createAdminClient()
        await admin.auth.admin.deleteUser(authUserId)
      } catch (cleanupError) {
        console.error('Invite accept cleanup error:', cleanupError)
      }
    }

    const message =
      error instanceof Error ? error.message : 'Unable to accept invite. Please try again.'
    return NextResponse.json({ error: message, code: 'ACCEPT_FAILED' }, { status: 400 })
  }
}
