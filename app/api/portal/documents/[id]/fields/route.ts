import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
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

/** Portal twin: a client fills in a previously-blank box on their own document
 * (flagged client_edited, pending CPA review). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', code: 'VALIDATION' }, { status: 400 })
    }

    const field = await createFieldForDocument({
      documentId: id,
      firmId: session.firmId,
      clientId: session.clientId,
      asClient: true,
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
    console.error('POST /api/portal/documents/[id]/fields error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
