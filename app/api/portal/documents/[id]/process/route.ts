import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { DOCUMENT_PROCESS_REQUESTED, inngest } from '@/lib/inngest/client'
import { getDocumentForExtraction } from '@/lib/supabase/documents'
import { markExtractionQueued } from '@/lib/supabase/extraction'
import { NextResponse } from 'next/server'

// Enqueue-only: the heavy extraction runs in the Inngest worker (/api/inngest),
// which owns the long duration, concurrency limits, throttling, and retries.
export const runtime = 'nodejs'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    // Confirm the document exists and belongs to this client/firm before queueing.
    const doc = await getDocumentForExtraction(id, session.firmId, session.clientId)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    await markExtractionQueued(doc.id)
    await inngest.send({
      name: DOCUMENT_PROCESS_REQUESTED,
      data: { documentId: doc.id, firmId: session.firmId, clientId: session.clientId },
    })

    // 202: accepted for background processing; the client polls for the outcome.
    return NextResponse.json({ ok: true, status: 'queued' }, { status: 202 })
  } catch (error) {
    console.error('POST /api/portal/documents/[id]/process error:', error)
    return NextResponse.json({ error: 'Failed to queue processing', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
