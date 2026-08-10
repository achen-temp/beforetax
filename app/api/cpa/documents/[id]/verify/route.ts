import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import { FieldNotFoundError, verifyAllFieldsForDocument } from '@/lib/supabase/document-fields'

/** Mark every not-yet-verified field on a document as verified (CPA sign-off). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const verified = await verifyAllFieldsForDocument({
      documentId: id,
      firmId,
      cpaUserId: user.id,
    })

    return NextResponse.json({ success: true, verified })
  } catch (error) {
    if (error instanceof FieldNotFoundError) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    console.error('POST /api/cpa/documents/[id]/verify error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
