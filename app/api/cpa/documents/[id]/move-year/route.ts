import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import {
  DocumentNotFoundError,
  MoveYearConflictError,
  moveDocumentToTaxYear,
} from '@/lib/supabase/documents'

const BodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  clientId: z.string().uuid(),
})

/** Move a document into another tax year for the same client (year-mismatch fix). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', code: 'BAD_REQUEST' }, { status: 400 })
    }

    const firmId = await getFirmId()
    const result = await moveDocumentToTaxYear({
      documentId: id,
      firmId,
      clientId: parsed.data.clientId,
      targetYear: parsed.data.year,
    })

    return NextResponse.json({ success: true, year: result.year })
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof MoveYearConflictError) {
      return NextResponse.json(
        {
          error: error.existingFileName
            ? `That tax year already has this file as “${error.existingFileName}”.`
            : 'That tax year already has this file.',
          code: 'DUPLICATE',
        },
        { status: 409 }
      )
    }
    console.error('POST /api/cpa/documents/[id]/move-year error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
