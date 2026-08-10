import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { DocumentNotFoundError, setDocumentExcluded } from '@/lib/supabase/documents'

const BodySchema = z.object({ excluded: z.boolean() })

/** Portal twin: let a client skip (or restore) one of their own uploads. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const parsed = BodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', code: 'BAD_REQUEST' }, { status: 400 })
    }

    await setDocumentExcluded({
      documentId: id,
      firmId: session.firmId,
      clientId: session.clientId,
      excluded: parsed.data.excluded,
      role: 'client',
    })

    return NextResponse.json({ success: true, excluded: parsed.data.excluded })
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    console.error('PATCH /api/portal/documents/[id]/exclude error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
