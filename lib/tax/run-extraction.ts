import { getFormSchema } from '@/lib/tax/field-schemas'
import { parseExtractionResult } from '@/lib/tax/extraction-result'
import { flattenExtraction, meanFieldConfidence } from '@/lib/tax/flatten-extraction'
import {
  markExtractionFailed,
  persistExtraction,
  type ExtractionContext,
} from '@/lib/supabase/extraction'

export type ExtractionOutcome =
  | { ok: true; fieldCount: number; formTypeMismatch: boolean }
  | { ok: false; error: string }

/**
 * End-to-end persistence for one document's extraction: validate the raw model
 * output, flatten it against the form schema, and write both the immutable JSON
 * snapshot (documents.extracted_data) and the normalized rows (document_fields).
 *
 * This does NOT call the model — it takes the raw text the model already
 * returned, so it can be reused for re-runs, replays, and tests. Any failure
 * marks the document `failed` (preserving the raw text) rather than throwing to
 * the caller, so a bad extraction never breaks the surrounding request.
 */
export async function runExtraction(params: {
  ctx: ExtractionContext
  rawModelText: string
}): Promise<ExtractionOutcome> {
  const { ctx, rawModelText } = params

  const schema = getFormSchema(ctx.formType)
  if (!schema) {
    const error = `No field schema for form type: ${ctx.formType}`
    await safeMarkFailed(ctx.documentId, error, rawModelText)
    return { ok: false, error }
  }

  const parsed = parseExtractionResult(rawModelText)
  if (!parsed.ok) {
    await safeMarkFailed(ctx.documentId, parsed.error, rawModelText)
    return { ok: false, error: parsed.error }
  }

  const result = parsed.data

  // On a form-type mismatch the model returns null fields by design; persist the
  // snapshot (so the UI can flag it) but write no rows.
  const rows = result.form_type_mismatch ? [] : flattenExtraction(result, schema)
  const confidenceScore = meanFieldConfidence(result)

  try {
    await persistExtraction({ ctx, result, rows, confidenceScore, rawResponse: rawModelText })
  } catch (e) {
    // persistExtraction already flips status to failed on the write it aborted on.
    const error = e instanceof Error ? e.message : 'Failed to persist extraction'
    return { ok: false, error }
  }

  return { ok: true, fieldCount: rows.length, formTypeMismatch: result.form_type_mismatch }
}

/** Never let the failure-marking itself throw and mask the original error. */
async function safeMarkFailed(documentId: string, reason: string, raw: string): Promise<void> {
  try {
    await markExtractionFailed(documentId, reason, raw)
  } catch {
    // swallow — the outcome is already being reported to the caller
  }
}
