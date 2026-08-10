import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import {
  FieldNotFoundError,
  InvalidFieldValueError,
  updateFieldByClient,
} from '@/lib/supabase/document-fields'

const bodySchema = z.object({
  value: z.string().optional(),
  code: z.string().nullable().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    if (parsed.data.value === undefined && parsed.data.code === undefined) {
      return NextResponse.json({ error: 'Nothing to update', code: 'VALIDATION' }, { status: 400 })
    }

    await updateFieldByClient({
      fieldId: id,
      firmId: session.firmId,
      clientId: session.clientId,
      value: parsed.data.value,
      code: parsed.data.code,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof FieldNotFoundError) {
      return NextResponse.json({ error: 'Field not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof InvalidFieldValueError) {
      return NextResponse.json({ error: error.message, code: 'VALIDATION' }, { status: 400 })
    }
    console.error('PATCH /api/portal/fields/[id] error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
