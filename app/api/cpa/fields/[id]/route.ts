import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import {
  FieldNotFoundError,
  InvalidFieldValueError,
  updateFieldByCpa,
} from '@/lib/supabase/document-fields'

const bodySchema = z.object({
  value: z.string().optional(),
  code: z.string().nullable().optional(),
  verified: z.boolean().optional(),
  clientId: z.string().uuid().optional(),
})

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

    const firmId = await getFirmId()
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', code: 'VALIDATION' }, { status: 400 })
    }
    if (
      parsed.data.value === undefined &&
      parsed.data.code === undefined &&
      parsed.data.verified === undefined
    ) {
      return NextResponse.json(
        { error: 'Nothing to update', code: 'VALIDATION' },
        { status: 400 }
      )
    }

    await updateFieldByCpa({
      fieldId: id,
      firmId,
      cpaUserId: user.id,
      value: parsed.data.value,
      code: parsed.data.code,
      verified: parsed.data.verified,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof FieldNotFoundError) {
      return NextResponse.json({ error: 'Field not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (error instanceof InvalidFieldValueError) {
      return NextResponse.json({ error: error.message, code: 'VALIDATION' }, { status: 400 })
    }
    console.error('PATCH /api/cpa/fields/[id] error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
