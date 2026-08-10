import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import {
  FieldNotFoundError,
  InvalidFieldValueError,
  createFieldForDocument,
} from '@/lib/supabase/document-fields'

const bodySchema = z.object({
  fieldKey: z.string().min(1),
  box: z.string().nullable().optional(),
  lineIndex: z.number().int().min(0).default(0),
  code: z.string().nullable().optional(),
  dataType: z.string().min(1),
  value: z.string(),
})

/** Fill in a previously-blank box on a document (CPA sign-off). */
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

    const firmId = await getFirmId()
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', code: 'VALIDATION' }, { status: 400 })
    }

    const field = await createFieldForDocument({
      documentId: id,
      firmId,
      cpaUserId: user.id,
      fieldKey: parsed.data.fieldKey,
      box: parsed.data.box ?? null,
      lineIndex: parsed.data.lineIndex,
      code: parsed.data.code ?? null,
      dataType: parsed.data.dataType,
      value: parsed.data.value,
    })

    return NextResponse.json({ field })
  } catch (error) {
    if (error instanceof FieldNotFoundError) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof InvalidFieldValueError) {
      return NextResponse.json({ error: error.message, code: 'VALIDATION' }, { status: 400 })
    }
    console.error('POST /api/cpa/documents/[id]/fields error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
