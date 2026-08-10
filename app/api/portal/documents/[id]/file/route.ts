import { NextResponse } from 'next/server'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { createDocumentSignedUrl, getDocumentFileRef } from '@/lib/supabase/documents'

/** Portal twin of the CPA file endpoint: a short-lived signed URL for the client
 * to view their own original document, scoped to their firm + client session. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const ref = await getDocumentFileRef(id, session.firmId, session.clientId)
    if (!ref) {
      return NextResponse.json({ error: 'Document not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const url = await createDocumentSignedUrl(ref.file_path)
    return NextResponse.json({
      url,
      mimeType: ref.mime_type,
      fileName: ref.file_name,
      pageNumbers: ref.page_numbers,
    })
  } catch (error) {
    console.error('GET /api/portal/documents/[id]/file error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
