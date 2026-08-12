import { createAdminClient } from '@/lib/supabase/admin'
import { mapSignupError } from '@/lib/auth/errors'
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit'
import { sendCpaVerificationEmail } from '@/lib/email/resend'
import { SignupApiSchema } from '@/lib/validations/auth'
import { NextResponse } from 'next/server'

const SIGNUP_LIMIT = 5
const SIGNUP_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

/** Skip email verification only when explicitly opted in (local/dev convenience). */
function shouldSkipEmailConfirm() {
  return process.env.CPA_SKIP_EMAIL_CONFIRM === 'true'
}

export async function POST(request: Request) {
  let authUserId: string | null = null

  try {
    const ip = getClientIp(request)
    const ipLimit = checkRateLimit(`signup:ip:${ip}`, SIGNUP_LIMIT, SIGNUP_WINDOW_MS)

    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const result = SignupApiSchema.safeParse(body)

    if (!result.success) {
      const firstError = result.error.issues[0]?.message ?? 'Invalid input'
      return NextResponse.json(
        { error: firstError, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const { email, password, firmName, firstName, lastName } = result.data

    const emailLimit = checkRateLimit(
      `signup:email:${email.toLowerCase()}`,
      3,
      SIGNUP_WINDOW_MS
    )

    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many signup attempts for this email. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }

    const admin = createAdminClient()
    const skipConfirm = shouldSkipEmailConfirm()

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: skipConfirm,
    })

    if (authError) {
      console.error('Signup auth error:', authError)
      return NextResponse.json(
        { error: mapSignupError(authError), code: 'SIGNUP_FAILED' },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Unable to create account. Please try again.', code: 'SIGNUP_FAILED' },
        { status: 400 }
      )
    }

    authUserId = authData.user.id

    const { data: firmId, error: rpcError } = await admin.rpc('register_cpa_owner', {
      p_user_id: authUserId,
      p_firm_name: firmName,
      p_email: email,
      p_first_name: firstName,
      p_last_name: lastName,
    })

    if (rpcError || !firmId) {
      console.error('Signup RPC error:', rpcError)
      await admin.auth.admin.deleteUser(authUserId)
      authUserId = null
      return NextResponse.json(
        { error: 'Unable to complete registration. Please try again.', code: 'SIGNUP_FAILED' },
        { status: 500 }
      )
    }

    if (skipConfirm) {
      return NextResponse.json({
        success: true,
        requiresEmailConfirmation: false,
      })
    }

    const redirectTo = `${appBaseUrl()}/auth/callback?redirect=/clients`
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })

    if (linkError || !linkData.properties?.action_link) {
      console.error('Signup generateLink error:', linkError)
      await admin.auth.admin.deleteUser(authUserId)
      authUserId = null
      // Deleting the auth user cascades cpa_users but leaves an orphan firm.
      await admin.from('cpa_firms').delete().eq('id', firmId)
      return NextResponse.json(
        { error: 'Unable to send verification email. Please try again.', code: 'SIGNUP_FAILED' },
        { status: 500 }
      )
    }

    const confirmUrl = linkData.properties.action_link

    try {
      const { devMode } = await sendCpaVerificationEmail({
        to: email,
        firmName,
        confirmUrl,
      })

      return NextResponse.json({
        success: true,
        requiresEmailConfirmation: true,
        ...(devMode ? { devConfirmUrl: confirmUrl } : {}),
      })
    } catch (emailError) {
      console.error('Signup verification email error:', emailError)
      await admin.auth.admin.deleteUser(authUserId)
      authUserId = null
      await admin.from('cpa_firms').delete().eq('id', firmId)
      return NextResponse.json(
        { error: 'Unable to send verification email. Please try again.', code: 'SIGNUP_FAILED' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('POST /api/auth/signup error:', error)

    if (authUserId) {
      try {
        const admin = createAdminClient()
        // Look up firm before deleting the user (cpa_users cascades away).
        const { data: profile } = await admin
          .from('cpa_users')
          .select('firm_id')
          .eq('id', authUserId)
          .maybeSingle()
        await admin.auth.admin.deleteUser(authUserId)
        if (profile?.firm_id) {
          await admin.from('cpa_firms').delete().eq('id', profile.firm_id)
        }
      } catch (cleanupError) {
        console.error('Signup cleanup error:', cleanupError)
      }
    }

    return NextResponse.json(
      { error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
