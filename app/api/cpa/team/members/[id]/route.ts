import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOwnerProfile } from '@/lib/supabase/cpa-users'
import { removeFirmMember } from '@/lib/supabase/firm-invites'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id: memberId } = await context.params
    if (!memberId) {
      return NextResponse.json(
        { error: 'Member id is required', code: 'VALIDATION_ERROR' },
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
        { error: 'Only the firm owner can remove teammates.', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    await removeFirmMember({
      firmId: owner.firmId,
      memberId,
      actorId: owner.userId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/cpa/team/members/[id] error:', error)
    const message = error instanceof Error ? error.message : 'Unable to remove member.'
    const status = /can’t|can't|not found|owner/i.test(message) ? 400 : 500
    return NextResponse.json(
      { error: message, code: status === 400 ? 'REMOVE_FAILED' : 'SERVER_ERROR' },
      { status }
    )
  }
}
