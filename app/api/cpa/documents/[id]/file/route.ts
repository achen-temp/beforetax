import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFirmId } from '@/lib/supabase/auth'
import { createDocumentSignedUrl, getDocumentFileRef } from '@/lib/supabase/documents'

/** Returns a short-lived signed URL so a CPA can view the original document while
 * reviewing its extracted fields. Scoped to the CPA's firm. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const ref = await getDocumentFileRef(id, firmId)
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
    console.error('GET /api/cpa/documents/[id]/file error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
