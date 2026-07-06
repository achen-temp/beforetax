import { createAdminClient } from '@/lib/supabase/admin'
import type { DocumentOwner, DocumentType } from '@/lib/tax/document-types'

export interface DocumentForExtraction {
  id: string
  firm_id: string
  tax_year_id: string
  file_path: string
  file_name: string
  mime_type: string | null
  owner: DocumentOwner
  extraction_status: string
}

/** Fetch the columns needed to run extraction, scoped to the owning client+firm. */
export async function getDocumentForExtraction(
  documentId: string,
  firmId: string,
  clientId: string
): Promise<DocumentForExtraction | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documents')
    .select('id, firm_id, tax_year_id, file_path, file_name, mime_type, owner, extraction_status')
    .eq('id', documentId)
    .eq('firm_id', firmId)
    .eq('client_id', clientId)
    .single()

  if (error || !data) return null
  return data as DocumentForExtraction
}

/** Download the raw bytes of a stored document from the private bucket. */
export async function downloadDocumentFile(filePath: string): Promise<Buffer> {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from('documents').download(filePath)
  if (error || !data) throw new Error(error?.message ?? 'Failed to download document')
  return Buffer.from(await data.arrayBuffer())
}

/**
 * Finalize a document we could classify but not field-extract (no schema for the
 * detected type). Records the detected type + classification snapshot so the CPA
 * still sees what it is.
 */
export async function finalizeClassificationOnly(
  documentId: string,
  fileType: DocumentType,
  classificationRaw: string
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('documents')
    .update({
      extraction_status: 'complete',
      file_type: fileType,
      raw_claude_response: { classification: classificationRaw },
    })
    .eq('id', documentId)
  if (error) throw new Error(`Failed to finalize classification: ${error.message}`)
}

export async function createDocumentRecord(input: {
  taxYearId: string
  firmId: string
  clientId: string
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documents')
    .insert({
      tax_year_id: input.taxYearId,
      firm_id: input.firmId,
      client_id: input.clientId,
      file_name: input.fileName,
      file_path: input.filePath,
      file_size: input.fileSize,
      mime_type: input.mimeType,
      source: 'portal',
      extraction_status: 'pending',
    })
    .select('id, file_name, created_at')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create document')
  return data
}

export async function listClientDocuments(clientId: string, firmId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documents')
    .select('id, file_name, file_size, mime_type, extraction_status, created_at')
    .eq('client_id', clientId)
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}
