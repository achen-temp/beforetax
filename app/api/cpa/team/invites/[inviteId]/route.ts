import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOwnerProfile } from '@/lib/supabase/cpa-users'
import { revokeFirmInvite } from '@/lib/supabase/firm-invites'

type RouteContext = { params: Promise<{ inviteId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { inviteId } = await context.params
    if (!inviteId) {
      return NextResponse.json(
        { error: 'Invite id is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
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
        { error: 'Only the firm owner can revoke invites.', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    await revokeFirmInvite(owner.firmId, inviteId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/cpa/team/invites/[inviteId] error:', error)
    const message = error instanceof Error ? error.message : 'Unable to revoke invite.'
    return NextResponse.json({ error: message, code: 'SERVER_ERROR' }, { status: 500 })
  }
}
