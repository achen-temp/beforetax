import { createAdminClient } from '@/lib/supabase/admin'
import { ensureTaxYear } from '@/lib/supabase/tax-years'
import type { DocumentOwner, DocumentType } from '@/lib/tax/document-types'
import { documentTypeLabel } from '@/lib/tax/document-type-labels'

export interface DocumentForExtraction {
  id: string
  firm_id: string
  tax_year_id: string
  file_path: string
  file_name: string
  file_size: number
  mime_type: string | null
  file_type: string
  source: string
  owner: DocumentOwner
  extraction_status: string
  /** Set on split children: which 1-based pages of the source file to extract. */
  page_numbers: number[] | null
  parent_document_id: string | null
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
    .select(
      'id, firm_id, tax_year_id, file_path, file_name, file_size, mime_type, file_type, source, owner, extraction_status, page_numbers, parent_document_id'
    )
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

export interface DocumentFileRef {
  id: string
  file_path: string
  mime_type: string
  file_name: string
  page_numbers: number[] | null
}

/**
 * Look up the storage reference for a document, scoped to a firm (and optionally a
 * client for portal access). Segmented children carry the parent's file_path plus
 * their own page_numbers, so the same row is enough to render "the original".
 */
export async function getDocumentFileRef(
  documentId: string,
  firmId: string,
  clientId?: string
): Promise<DocumentFileRef | null> {
  const admin = createAdminClient()
  let query = admin
    .from('documents')
    .select('id, file_path, mime_type, file_name, page_numbers')
    .eq('id', documentId)
    .eq('firm_id', firmId)
  if (clientId) query = query.eq('client_id', clientId)
  const { data } = await query.maybeSingle()
  return (data as DocumentFileRef) ?? null
}

/** Short-lived signed URL for viewing a private document in the browser. */
export async function createDocumentSignedUrl(
  filePath: string,
  expiresInSeconds = 3600
): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('documents')
    .createSignedUrl(filePath, expiresInSeconds)
  if (error || !data) throw new Error(error?.message ?? 'Failed to sign document URL')
  return data.signedUrl
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

/** A prior upload of the same content within a tax year, or null. Excludes failed
 * uploads so a retry isn't blocked by a dead row. */
export async function findDocumentByHash(taxYearId: string, fileHash: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documents')
    .select('id, file_name, created_at')
    .eq('tax_year_id', taxYearId)
    .eq('file_hash', fileHash)
    .neq('extraction_status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

/** Thrown when the unique content-hash index rejects a concurrent duplicate insert. */
export class DuplicateDocumentError extends Error {
  constructor() {
    super('DUPLICATE_DOCUMENT')
    this.name = 'DuplicateDocumentError'
  }
}

/** Thrown when an exclude/restore targets a document the caller can't reach. */
export class DocumentNotFoundError extends Error {
  constructor() {
    super('DOCUMENT_NOT_FOUND')
    this.name = 'DocumentNotFoundError'
  }
}

/**
 * Reversible "skip" for a document: set (or clear) excluded_at. Skipped docs stay
 * stored and viewable but are dropped from tax-data assembly, review counts, and
 * exports. Scoped to a firm, and additionally to a client for portal callers.
 */
export async function setDocumentExcluded(params: {
  documentId: string
  firmId: string
  clientId?: string
  excluded: boolean
  role: 'cpa' | 'client'
  userId?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  const patch = params.excluded
    ? {
        excluded_at: new Date().toISOString(),
        excluded_by_role: params.role,
        excluded_by: params.userId ?? null,
      }
    : { excluded_at: null, excluded_by_role: null, excluded_by: null }

  let query = admin
    .from('documents')
    .update(patch)
    .eq('id', params.documentId)
    .eq('firm_id', params.firmId)
  if (params.clientId) query = query.eq('client_id', params.clientId)

  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DocumentNotFoundError()
}

/** Target year already has this file’s content hash (dedup). */
export class MoveYearConflictError extends Error {
  constructor(public readonly existingFileName: string | null) {
    super('MOVE_YEAR_CONFLICT')
    this.name = 'MoveYearConflictError'
  }
}

/**
 * Move a document (and its field rows) to another tax year for the same client.
 * Creates the destination tax_years row if needed. Used when the form’s printed
 * year disagrees with the return it was uploaded into.
 */
export async function moveDocumentToTaxYear(params: {
  documentId: string
  firmId: string
  clientId?: string
  targetYear: number
}): Promise<{ year: number; taxYearId: string }> {
  const admin = createAdminClient()

  let lookup = admin
    .from('documents')
    .select('id, client_id, tax_year_id, file_hash, file_name')
    .eq('id', params.documentId)
    .eq('firm_id', params.firmId)
  if (params.clientId) lookup = lookup.eq('client_id', params.clientId)

  const { data: doc, error: docError } = await lookup.maybeSingle()
  if (docError) throw new Error(docError.message)
  if (!doc) throw new DocumentNotFoundError()

  const clientId = doc.client_id as string
  const target = await ensureTaxYear({
    clientId,
    firmId: params.firmId,
    year: params.targetYear,
  })

  if (target.id === doc.tax_year_id) {
    return { year: target.year, taxYearId: target.id }
  }

  const hash = doc.file_hash as string | null
  if (hash) {
    const existing = await findDocumentByHash(target.id, hash)
    if (existing && existing.id !== doc.id) {
      throw new MoveYearConflictError(existing.file_name ?? null)
    }
  }

  const { data: updated, error: updError } = await admin
    .from('documents')
    .update({ tax_year_id: target.id })
    .eq('id', doc.id)
    .eq('firm_id', params.firmId)
    .select('id')
    .maybeSingle()

  if (updError?.code === '23505') {
    throw new MoveYearConflictError(null)
  }
  if (updError) throw new Error(updError.message)
  if (!updated) throw new DocumentNotFoundError()

  const { error: fieldsError } = await admin
    .from('document_fields')
    .update({ tax_year_id: target.id })
    .eq('document_id', doc.id)
    .eq('firm_id', params.firmId)

  if (fieldsError) throw new Error(fieldsError.message)

  return { year: target.year, taxYearId: target.id }
}

export async function createDocumentRecord(input: {
  taxYearId: string
  firmId: string
  clientId: string
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
  fileHash?: string | null
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
      file_hash: input.fileHash ?? null,
      source: 'portal',
      extraction_status: 'pending',
    })
    .select('id, file_name, created_at')
    .single()

  // 23505 = unique_violation on uq_documents_hash: a concurrent request inserted
  // the same content first. Surface a typed error so the route can 409.
  if (error?.code === '23505') throw new DuplicateDocumentError()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create document')
  return data
}

export async function listClientDocuments(
  clientId: string,
  firmId: string,
  taxYearId?: string
) {
  const admin = createAdminClient()
  let query = admin
    .from('documents')
    .select('id, file_name, file_size, mime_type, extraction_status, created_at')
    .eq('client_id', clientId)
    .eq('firm_id', firmId)
    // Split containers are internal — their children (the actual forms) are listed.
    .eq('is_container', false)
    .order('created_at', { ascending: false })

  if (taxYearId) query = query.eq('tax_year_id', taxYearId)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export interface ChildSegmentInput {
  formType: string
  pages: number[]
  uncertain: boolean
}

export interface ChildDocument {
  id: string
  page_numbers: number[] | null
  extraction_status: string
}

/** First 1-2 tokens of a type label ("W-2", "1099-NEC") for a compact child name. */
function childFileName(parentName: string, seg: ChildSegmentInput): string {
  const label = documentTypeLabel(seg.formType).split(' — ')[0]
  return `${parentName} · ${label} (p${seg.pages.join(',')})`
}

/**
 * Create one child document per detected form segment, each covering a subset of
 * the parent file's pages. Idempotent: if the parent was already split (e.g. an
 * Inngest retry re-enters here), the existing children are returned unchanged.
 */
export async function createChildDocuments(params: {
  parent: DocumentForExtraction
  clientId: string
  segments: ChildSegmentInput[]
}): Promise<ChildDocument[]> {
  const admin = createAdminClient()
  const { parent } = params

  const { data: existing } = await admin
    .from('documents')
    .select('id, page_numbers, extraction_status')
    .eq('parent_document_id', parent.id)
  if (existing && existing.length > 0) return existing as ChildDocument[]

  const rows = params.segments.map((seg) => ({
    tax_year_id: parent.tax_year_id,
    firm_id: parent.firm_id,
    client_id: params.clientId,
    parent_document_id: parent.id,
    file_name: childFileName(parent.file_name, seg),
    file_path: parent.file_path,
    file_size: parent.file_size,
    mime_type: parent.mime_type,
    // The segmentation guess becomes the initial file_type so child extraction can
    // cross-validate against it. file_hash stays null — children aren't uploads.
    file_type: seg.formType,
    file_hash: null,
    source: parent.source,
    page_numbers: seg.pages,
    segmentation_uncertain: seg.uncertain,
    extraction_status: 'queued',
  }))

  const { data, error } = await admin
    .from('documents')
    .insert(rows)
    .select('id, page_numbers, extraction_status')
  if (error || !data) throw new Error(error?.message ?? 'Failed to create child documents')
  return data as ChildDocument[]
}

/** Mark a split parent as a container: excluded from lists and never extracted. */
export async function markDocumentAsContainer(documentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('documents')
    .update({ is_container: true, extraction_status: 'complete' })
    .eq('id', documentId)
  if (error) throw new Error(`Failed to mark container: ${error.message}`)
}

/** Flag a document for CPA review when segmentation (or its cross-validation) was
 * ambiguous. Non-blocking: the document still processes normally. */
export async function flagSegmentationUncertain(documentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('documents')
    .update({ segmentation_uncertain: true })
    .eq('id', documentId)
  if (error) throw new Error(`Failed to flag segmentation: ${error.message}`)
}
