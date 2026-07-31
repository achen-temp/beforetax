import type { DocumentType } from '@/lib/tax/document-types'
import { getFormSchema } from '@/lib/tax/field-schemas'
import { parseExtractionResult } from '@/lib/tax/extraction-result'
import { flattenExtraction, meanFieldConfidence } from '@/lib/tax/flatten-extraction'
import {
  applyBox12CodeValidation,
  applyOcrConfidence,
  applyStateCoverage,
  applyW2ArithmeticChecks,
  reconcileRows,
} from '@/lib/tax/reconcile-extraction'
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
 *
 * When `verifyModelText` (an independent second pass) is supplied and parses,
 * the two passes are reconciled: agreeing fields are trusted, disagreements are
 * flagged for review (see reconcile-extraction.ts). Optional `ocrNumbers` (from
 * a Tesseract pass over the page) give an independent third signal on numeric
 * fields. The persisted snapshot is always the primary read.
 */
export async function runExtraction(params: {
  ctx: ExtractionContext
  rawModelText: string
  verifyModelText?: string
  ocrNumbers?: number[]
  ocrStates?: string[]
}): Promise<ExtractionOutcome> {
  const { ctx, rawModelText, verifyModelText, ocrNumbers, ocrStates } = params

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
  let rows = result.form_type_mismatch ? [] : flattenExtraction(result, schema)

  // Cross-check against the verification pass when available. A failed/mismatched
  // verify pass is ignored — we fall back to the single-pass OCR annotation.
  let reconciled = false
  if (rows.length > 0 && verifyModelText) {
    const verifyParsed = parseExtractionResult(verifyModelText)
    if (verifyParsed.ok && !verifyParsed.data.form_type_mismatch) {
      const verifyRows = flattenExtraction(verifyParsed.data, schema)
      rows = reconcileRows(rows, verifyRows, schema, ocrNumbers).rows
      reconciled = true
    }
  }
  // Default (single-pass) path: deterministic OCR annotations only — never
  // changes values. Numeric cross-check flags likely misreads; state coverage
  // dedupes repeated states and flags the section if OCR saw a state the model
  // dropped. (Dual-pass reconcile has its own group merge/dedup, so this is
  // scoped to the single-pass path.)
  if (!reconciled && rows.length > 0) {
    rows = applyOcrConfidence(rows, ocrNumbers)
    const coverage = applyStateCoverage(rows, ocrStates)
    rows = coverage.rows
    if (coverage.missingStates.length > 0) {
      console.warn(
        `[extract] document ${ctx.documentId}: OCR saw state(s) ${coverage.missingStates.join(', ')} not returned by the model; state section flagged for review`
      )
    }
  }

  // W-2 business-rule sanity checks (both paths): payroll-ratio math + Box 12 code
  // whitelist. Deterministic — only lower confidence / normalize codes, never
  // change amounts.
  if (ctx.formType === 'w2' && rows.length > 0) {
    rows = applyW2ArithmeticChecks(rows)
    rows = applyBox12CodeValidation(rows)
  }

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

/** Confidence at/above which a field is considered trustworthy; below it the UI
 * flags the field for review, so the selective-verify gate uses the same bar. */
const VERIFY_GATE_THRESHOLD = 0.9

/**
 * Decide whether a single-pass extraction is uncertain enough to justify a second
 * (verification) pass. Cheap + deterministic and side-effect-free: parse the raw
 * text, flatten, and run the SAME OCR + W-2 sanity annotations used for the final
 * rows, then check whether any field would be flagged for review. A parse failure
 * also warrants a retry pass. Clean documents return false and stay single-pass.
 */
export function warrantsVerification(params: {
  rawModelText: string
  formType: DocumentType
  ocrNumbers?: number[]
  ocrStates?: string[]
}): boolean {
  const schema = getFormSchema(params.formType)
  if (!schema) return false

  const parsed = parseExtractionResult(params.rawModelText)
  if (!parsed.ok) return true // unparseable single pass — a second try may succeed
  if (parsed.data.form_type_mismatch) return false

  let rows = flattenExtraction(parsed.data, schema)
  if (rows.length === 0) return false

  rows = applyOcrConfidence(rows, params.ocrNumbers)
  rows = applyStateCoverage(rows, params.ocrStates).rows
  if (params.formType === 'w2') {
    rows = applyW2ArithmeticChecks(rows)
    rows = applyBox12CodeValidation(rows)
  }

  return rows.some((r) => r.confidence !== null && r.confidence < VERIFY_GATE_THRESHOLD)
}

/** Never let the failure-marking itself throw and mask the original error. */
async function safeMarkFailed(documentId: string, reason: string, raw: string): Promise<void> {
  try {
    await markExtractionFailed(documentId, reason, raw)
  } catch {
    // swallow — the outcome is already being reported to the caller
  }
}
