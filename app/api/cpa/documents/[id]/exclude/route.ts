import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import { DocumentNotFoundError, setDocumentExcluded } from '@/lib/supabase/documents'

const BodySchema = z.object({ excluded: z.boolean() })

/** Skip (or restore) a document so it isn't used in tax data, counts, or exports. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const parsed = BodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', code: 'BAD_REQUEST' }, { status: 400 })
    }

    const firmId = await getFirmId()
    await setDocumentExcluded({
      documentId: id,
      firmId,
      excluded: parsed.data.excluded,
      role: 'cpa',
      userId: user.id,
    })

    return NextResponse.json({ success: true, excluded: parsed.data.excluded })
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    console.error('PATCH /api/cpa/documents/[id]/exclude error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
