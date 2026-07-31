import crypto from 'crypto'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import {
  FILE_HASH_PATTERN,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
  SUPPORTED_FORMATS_LABEL,
  isAllowedUpload,
} from '@/lib/files'
import {
  DuplicateDocumentError,
  createDocumentRecord,
  findDocumentByHash,
  listClientDocuments,
} from '@/lib/supabase/documents'
import { getCurrentTaxYear } from '@/lib/supabase/tax-years'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UploadSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    fileSize: z.number().int().positive().max(MAX_FILE_SIZE, `File too large (max ${MAX_FILE_SIZE_MB}MB).`),
    // Browsers send empty/generic mime for HEIC and some Office files, so accept
    // any string here and validate by mime-or-extension below.
    mimeType: z.string().max(255),
    // SHA-256 of the file bytes, computed in the browser for content dedup.
    fileHash: z.string().regex(FILE_HASH_PATTERN, 'Invalid file hash'),
  })
  .refine((v) => isAllowedUpload(v.mimeType, v.fileName), {
    message: `Unsupported file type. Accepted: ${SUPPORTED_FORMATS_LABEL}.`,
    path: ['mimeType'],
  })

export async function GET() {
  try {
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const documents = await listClientDocuments(session.clientId, session.firmId)
    return NextResponse.json({ documents })
  } catch (error) {
    console.error('GET /api/portal/documents error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const body = await request.json()
    const result = UploadSchema.safeParse(body)
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Invalid file metadata'
      return NextResponse.json({ error: message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const taxYear = await getCurrentTaxYear(session.clientId, session.firmId)
    if (!taxYear) {
      return NextResponse.json({ error: 'Tax year not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Content dedup: if the same file was already uploaded this tax year, stop
    // before minting an upload URL or a DB row. Cheap and keeps identical
    // re-uploads out of the extraction queue.
    const existing = await findDocumentByHash(taxYear.id, result.data.fileHash)
    if (existing) {
      return NextResponse.json(
        {
          error: `You already uploaded this file${existing.file_name ? ` as “${existing.file_name}”` : ''}.`,
          code: 'DUPLICATE',
          duplicateOf: existing,
        },
        { status: 409 }
      )
    }

    const safeName = result.data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `${session.firmId}/${session.clientId}/${taxYear.year}/${crypto.randomUUID()}_${safeName}`

    const admin = createAdminClient()
    const { data: signed, error: signError } = await admin.storage
      .from('documents')
      .createSignedUploadUrl(filePath)

    if (signError || !signed) {
      console.error('Storage signed URL error:', signError)
      return NextResponse.json(
        { error: 'Upload is not available yet. Please contact your CPA.', code: 'STORAGE_ERROR' },
        { status: 503 }
      )
    }

    let document
    try {
      document = await createDocumentRecord({
        taxYearId: taxYear.id,
        firmId: session.firmId,
        clientId: session.clientId,
        fileName: result.data.fileName,
        filePath,
        fileSize: result.data.fileSize,
        mimeType: result.data.mimeType,
        fileHash: result.data.fileHash,
      })
    } catch (err) {
      // Lost a race: another request inserted the same content between our
      // pre-check and this insert. Re-resolve the winner and 409.
      if (err instanceof DuplicateDocumentError) {
        const winner = await findDocumentByHash(taxYear.id, result.data.fileHash)
        return NextResponse.json(
          {
            error: `You already uploaded this file${winner?.file_name ? ` as “${winner.file_name}”` : ''}.`,
            code: 'DUPLICATE',
            duplicateOf: winner,
          },
          { status: 409 }
        )
      }
      throw err
    }

    return NextResponse.json({
      uploadUrl: signed.signedUrl,
      token: signed.token,
      path: filePath,
      document,
    })
  } catch (error) {
    console.error('POST /api/portal/documents error:', error)
    return NextResponse.json({ error: 'Upload failed', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
