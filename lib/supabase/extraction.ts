import { createAdminClient } from '@/lib/supabase/admin'
import type { DocumentType, DocumentOwner } from '@/lib/tax/document-types'
import { isDocumentType } from '@/lib/tax/document-types'
import type { ExtractionResult } from '@/lib/tax/extraction-result'
import type { DocumentFieldInput } from '@/lib/tax/flatten-extraction'

/** Document context needed to attribute extracted rows (RLS + aggregation keys). */
export interface ExtractionContext {
  documentId: string
  firmId: string
  taxYearId: string
  /** Owner resolved by the backend, not the model. */
  owner: DocumentOwner
  /** Expected form type that drove the extraction schema. */
  formType: DocumentType
}

export async function markExtractionProcessing(documentId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('documents')
    .update({ extraction_status: 'processing' })
    .eq('id', documentId)
  if (error) throw new Error(`Failed to mark document processing: ${error.message}`)
}

/**
 * Record a failed extraction. Keeps the raw model text in raw_claude_response so
 * the failure can be debugged/re-run without losing the original output.
 */
export async function markExtractionFailed(
  documentId: string,
  reason: string,
  rawResponse?: string
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('documents')
    .update({
      extraction_status: 'failed',
      raw_claude_response: { error: reason, raw: rawResponse ?? null },
    })
    .eq('id', documentId)
  if (error) throw new Error(`Failed to mark document failed: ${error.message}`)
}

/**
 * Persist a successful extraction. Idempotent: existing field rows for the
 * document are cleared and re-inserted so re-running the AI job never duplicates
 * (matches the UNIQUE(document_id, owner, field_key, box, line_index) intent).
 *
 * Note: Supabase REST has no cross-table transaction, so writes are ordered
 * fields-first, then the document snapshot/status. If the field write fails the
 * status is flipped to failed and the error is surfaced.
 */
export async function persistExtraction(params: {
  ctx: ExtractionContext
  result: ExtractionResult
  rows: DocumentFieldInput[]
  confidenceScore: number | null
  rawResponse?: string
}): Promise<void> {
  const { ctx, result, rows, confidenceScore, rawResponse } = params
  const admin = createAdminClient()

  const { error: deleteError } = await admin
    .from('document_fields')
    .delete()
    .eq('document_id', ctx.documentId)
  if (deleteError) {
    await markExtractionFailed(ctx.documentId, `Clearing old fields failed: ${deleteError.message}`, rawResponse)
    throw new Error(deleteError.message)
  }

  if (rows.length > 0) {
    const insertRows = rows.map((r) => ({
      firm_id: ctx.firmId,
      tax_year_id: ctx.taxYearId,
      document_id: ctx.documentId,
      owner: ctx.owner,
      form_type: ctx.formType,
      box: r.box,
      line_index: r.line_index,
      code: r.code,
      field_key: r.field_key,
      data_type: r.data_type,
      value_number: r.value_number,
      value_text: r.value_text,
      value_date: r.value_date,
      source_json_path: r.source_json_path,
      confidence: r.confidence,
    }))

    const { error: insertError } = await admin.from('document_fields').insert(insertRows)
    if (insertError) {
      await markExtractionFailed(ctx.documentId, `Inserting fields failed: ${insertError.message}`, rawResponse)
      throw new Error(insertError.message)
    }
  }

  // Only trust the model's form_type to relabel the document when it agrees it's
  // the expected form; a mismatch keeps the existing file_type untouched.
  const detected = !result.form_type_mismatch && isDocumentType(result.form_type)
    ? (result.form_type as DocumentType)
    : ctx.formType

  const { error: docError } = await admin
    .from('documents')
    .update({
      extraction_status: 'complete',
      extracted_data: result,
      raw_claude_response: rawResponse ? { raw: rawResponse } : null,
      confidence_score: confidenceScore,
      file_type: detected,
    })
    .eq('id', ctx.documentId)
  if (docError) throw new Error(`Failed to save extraction snapshot: ${docError.message}`)
}
