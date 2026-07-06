import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { processDocument } from '@/lib/tax/process-document'
import { NextResponse } from 'next/server'

// Node runtime: extraction uses sharp/heic-convert/mammoth/xlsx (not edge-safe).
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const result = await processDocument({
      documentId: id,
      firmId: session.firmId,
      clientId: session.clientId,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'Processing failed', code: 'PROCESSING_ERROR' },
        { status: 502 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('POST /api/portal/documents/[id]/process error:', error)
    return NextResponse.json({ error: 'Processing failed', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
