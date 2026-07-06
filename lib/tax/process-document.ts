import { isDocumentType, type DocumentType } from '@/lib/tax/document-types'
import { getSupportedFormTypes } from '@/lib/tax/field-schemas'
import { parseClassification } from '@/lib/tax/classify-result'
import { classifyDocument, extractAndPersistDocument } from '@/lib/tax/extract-document'
import { prepareDocumentInputs, UnsupportedFileTypeError } from '@/lib/tax/prepare-input'
import { markExtractionFailed, markExtractionProcessing } from '@/lib/supabase/extraction'
import {
  downloadDocumentFile,
  finalizeClassificationOnly,
  getDocumentForExtraction,
} from '@/lib/supabase/documents'

export interface ProcessResult {
  ok: boolean
  formType?: DocumentType
  extracted?: boolean
  fieldCount?: number
  error?: string
}

/**
 * Full document pipeline: download -> normalize inputs -> classify -> (if a
 * schema exists) field-extract & persist. Called after upload completes.
 *
 * Two model calls: one to classify the form type, one to extract fields for that
 * type. Documents whose type has no field schema yet are still recorded with the
 * detected type so the CPA sees what came in.
 */
export async function processDocument(params: {
  documentId: string
  firmId: string
  clientId: string
}): Promise<ProcessResult> {
  const doc = await getDocumentForExtraction(params.documentId, params.firmId, params.clientId)
  if (!doc) return { ok: false, error: 'Document not found' }

  await markExtractionProcessing(doc.id)

  try {
    const bytes = await downloadDocumentFile(doc.file_path)
    const inputs = await prepareDocumentInputs({
      data: bytes,
      mimeType: doc.mime_type ?? '',
      filename: doc.file_name,
    })

    const classificationRaw = await classifyDocument({ inputs })
    const parsed = parseClassification(classificationRaw)
    const formType: DocumentType =
      parsed.ok && isDocumentType(parsed.data.form_type) ? parsed.data.form_type : 'unknown'

    // No field schema for this type yet — record the detection and stop.
    if (!getSupportedFormTypes().includes(formType)) {
      await finalizeClassificationOnly(doc.id, formType, classificationRaw)
      return { ok: true, formType, extracted: false }
    }

    const outcome = await extractAndPersistDocument({
      ctx: {
        documentId: doc.id,
        firmId: doc.firm_id,
        taxYearId: doc.tax_year_id,
        owner: doc.owner,
        formType,
      },
      inputs,
    })

    if (!outcome.ok) return { ok: false, formType, error: outcome.error }
    return { ok: true, formType, extracted: true, fieldCount: outcome.fieldCount }
  } catch (e) {
    const error =
      e instanceof UnsupportedFileTypeError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Processing failed'
    await markExtractionFailed(doc.id, error).catch(() => {})
    return { ok: false, error }
  }
}
