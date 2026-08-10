import { isDocumentType, type DocumentType } from '@/lib/tax/document-types'
import { getSupportedFormTypes } from '@/lib/tax/field-schemas'
import { parseClassification } from '@/lib/tax/classify-result'
import {
  classifyDocument,
  extractAndPersistDocument,
  type DocumentInput,
} from '@/lib/tax/extract-document'
import { prepareDocumentInputs, UnsupportedFileTypeError } from '@/lib/tax/prepare-input'
import { formFamily } from '@/lib/tax/ocr'
import { segmentDocument } from '@/lib/tax/segment-document'
import { markExtractionFailed, markExtractionProcessing } from '@/lib/supabase/extraction'
import {
  createChildDocuments,
  downloadDocumentFile,
  finalizeClassificationOnly,
  flagSegmentationUncertain,
  getDocumentForExtraction,
  markDocumentAsContainer,
  type DocumentForExtraction,
} from '@/lib/supabase/documents'
import { DOCUMENT_PROCESS_REQUESTED, inngest } from '@/lib/inngest/client'

export interface ProcessResult {
  ok: boolean
  formType?: DocumentType
  extracted?: boolean
  fieldCount?: number
  /** Number of child forms this file was split into (container result). */
  split?: number
  error?: string
}

/**
 * Full document pipeline: download -> normalize inputs -> (segment multi-form
 * files) -> classify -> field-extract & persist. Called after upload completes,
 * and again (via fan-out) for each child of a split file.
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

    // Child of a split file: extract only its assigned pages, no re-segmentation.
    if (doc.page_numbers && doc.page_numbers.length > 0) {
      const childInputs = doc.page_numbers
        .map((p) => inputs[p - 1])
        .filter((i): i is DocumentInput => i !== undefined)
      const inputsToUse = childInputs.length > 0 ? childInputs : inputs
      return classifyAndExtract(doc, inputsToUse, params.clientId, doc.file_type)
    }

    // Parent/standalone: try to split a bundled multi-form file first.
    const seg = await segmentDocument({ inputs })
    if (seg.multiForm) {
      if (seg.confident) {
        const children = await createChildDocuments({
          parent: doc,
          clientId: params.clientId,
          segments: seg.segments.map((s) => ({
            formType: isDocumentType(s.formType) ? s.formType : 'unknown',
            pages: s.pages,
            uncertain: s.uncertain,
          })),
        })
        await markDocumentAsContainer(doc.id)
        await fanOutChildren(children, params.firmId, params.clientId)
        return { ok: true, split: children.length }
      }
      // Multi-form but AI/OCR disagreed: don't guess a split — flag and extract
      // the file whole so nothing is lost while a human reviews the boundaries.
      await flagSegmentationUncertain(doc.id)
    }

    return classifyAndExtract(doc, inputs, params.clientId, null)
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

/**
 * Classify the given inputs and, if a schema exists for the detected type,
 * field-extract & persist. When `predictedFormType` is set (a split child), the
 * classification is cross-validated against the segmentation guess; a mismatch
 * flags the child for review but does not block extraction.
 */
async function classifyAndExtract(
  doc: DocumentForExtraction,
  inputs: DocumentInput[],
  clientId: string,
  predictedFormType: string | null
): Promise<ProcessResult> {
  const classificationRaw = await classifyDocument({ inputs })
  const parsed = parseClassification(classificationRaw)
  const formType: DocumentType =
    parsed.ok && isDocumentType(parsed.data.form_type) ? parsed.data.form_type : 'unknown'

  // Extraction as its own validator: if the child really is a different form than
  // segmentation predicted, the split boundaries were likely wrong -> flag review.
  if (predictedFormType) {
    const predicted = formFamily(predictedFormType)
    const actual = formFamily(formType)
    if (predicted !== null && actual !== null && predicted !== actual) {
      await flagSegmentationUncertain(doc.id).catch(() => {})
    }
  }

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
}

/** Dispatch a processing event per child so each form is classified/extracted on
 * its own — parallel, independently retried, and subject to the same concurrency
 * limits. Already-complete children (a retry re-entering) are skipped. */
async function fanOutChildren(
  children: { id: string; extraction_status: string }[],
  firmId: string,
  clientId: string
): Promise<void> {
  const pending = children.filter((c) => c.extraction_status !== 'complete')
  if (pending.length === 0) return
  await inngest.send(
    pending.map((child) => ({
      name: DOCUMENT_PROCESS_REQUESTED,
      data: { documentId: child.id, firmId, clientId },
    }))
  )
}
