import type { DocumentType } from '@/lib/tax/document-types'
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildClassificationPrompt,
  buildExtractionUserPrompt,
} from '@/lib/tax/extraction-prompt'
import { buildExtractionJsonSchema } from '@/lib/tax/extraction-json-schema'
import {
  filePartFromBase64,
  imagePartFromBase64,
  imagePartFromUrl,
  runResponse,
  textPart,
  type InputPart,
  type ResponsesMessage,
} from '@/lib/llm/client'
import { getLlmConfig, type LlmReasoningEffort } from '@/lib/llm/config'
import { extractOcrNumbers, extractStateCodes, ocrImages, type OcrImage } from '@/lib/tax/ocr'
import { runExtraction, warrantsVerification, type ExtractionOutcome } from '@/lib/tax/run-extraction'
import { markExtractionFailed, type ExtractionContext } from '@/lib/supabase/extraction'

/**
 * A document to send to the model. Supported natively by the Responses API:
 *   - images (JPG/PNG/WEBP/GIF): hosted url or inline base64
 *   - PDFs: inline base64 (sent as an input_file)
 * Word/other formats are NOT model-native — extract their text upstream and
 * pass it as { text } (e.g. mammoth for .docx).
 */
export type DocumentInput =
  | { url: string }
  | { base64: string; mimeType: string; filename?: string }
  | { text: string }

/** @deprecated use DocumentInput */
export type DocumentImage = DocumentInput

/** Deterministic signals derived from one OCR pass over the page images. */
interface OcrSignals {
  numbers: number[]
  states: string[]
}

/** Pull base64 image inputs (the only OCR-able ones) for the Tesseract pass. */
function imageInputs(inputs: DocumentInput[]): OcrImage[] {
  const out: OcrImage[] = []
  for (const input of inputs) {
    if ('base64' in input && input.mimeType.startsWith('image/')) {
      out.push({ base64: input.base64, mimeType: input.mimeType })
    }
  }
  return out
}

function toInputPart(input: DocumentInput): InputPart {
  if ('text' in input) return textPart(input.text)
  if ('url' in input) return imagePartFromUrl(input.url)

  if (input.mimeType.startsWith('image/')) {
    return imagePartFromBase64(input.base64, input.mimeType)
  }
  // Non-image (PDF, etc.) goes through input_file; a filename helps the model.
  const filename = input.filename ?? `document.${mimeExtension(input.mimeType)}`
  return filePartFromBase64(input.base64, input.mimeType, filename)
}

function mimeExtension(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'pdf'
  const tail = mimeType.split('/')[1]
  return tail ? tail.split('+')[0] : 'bin'
}

function toInputParts(inputs: DocumentInput[]): InputPart[] {
  return inputs.map(toInputPart)
}

/**
 * Run field extraction for a known form type and return the raw model text.
 * Uses strict json_schema structured output so the response conforms to the
 * form's field schema; runExtraction still validates it before persisting.
 */
export async function extractDocumentFields(params: {
  formType: DocumentType
  inputs: DocumentInput[]
  model?: string
  reasoningEffort?: LlmReasoningEffort
}): Promise<string> {
  const messages: ResponsesMessage[] = [
    { role: 'system', content: [textPart(EXTRACTION_SYSTEM_PROMPT)] },
    {
      role: 'user',
      content: [textPart(buildExtractionUserPrompt(params.formType)), ...toInputParts(params.inputs)],
    },
  ]

  const result = await runResponse({
    messages,
    model: params.model,
    // Extraction accuracy (reading dense multi-copy forms, every state row, exact
    // digits) benefits most from deliberate reasoning. Overridable via env.
    reasoningEffort: params.reasoningEffort ?? 'high',
    jsonSchema: buildExtractionJsonSchema(params.formType),
  })
  return result.text
}

/**
 * Classify an unknown document. Returns the raw classification JSON text (see
 * buildClassificationPrompt for the shape).
 */
export async function classifyDocument(params: {
  inputs: DocumentInput[]
  model?: string
}): Promise<string> {
  const messages: ResponsesMessage[] = [
    {
      role: 'user',
      content: [textPart(buildClassificationPrompt()), ...toInputParts(params.inputs)],
    },
  ]

  // Classification is a simpler task (just the form type) — keep it fast/cheap.
  const result = await runResponse({ messages, model: params.model, reasoningEffort: 'low' })
  return result.text
}

/**
 * One-call pipeline: extract a document's fields with the LLM, then validate and
 * persist. Extraction/model failures are captured and the document is marked
 * failed (never throws for a bad model response).
 */
export async function extractAndPersistDocument(params: {
  ctx: ExtractionContext
  inputs: DocumentInput[]
  model?: string
}): Promise<ExtractionOutcome> {
  let rawModelText: string
  let verifyModelText: string | undefined
  let ocrNumbers: number[] | undefined
  let ocrStates: string[] | undefined
  try {
    const config = getLlmConfig()
    const runOnce = (reasoningEffort: LlmReasoningEffort = 'high') =>
      extractDocumentFields({
        formType: params.ctx.formType,
        inputs: params.inputs,
        model: params.model,
        reasoningEffort,
      })
    const isTimeoutError = (err: unknown): err is Error =>
      err instanceof Error && /timed out/i.test(err.message)

    // Best-effort OCR over the page images, run alongside the LLM call(s) so it
    // hides under their latency. Only image inputs are OCR-able. One recognition
    // pass yields both the numeric cross-check and the state-coverage signal.
    const emptyOcr: OcrSignals = { numbers: [], states: [] }
    const ocrTask: Promise<OcrSignals> = config.ocrCrossCheck
      ? ocrImages(imageInputs(params.inputs))
          .then((text) => ({ numbers: extractOcrNumbers(text), states: extractStateCodes(text) }))
          .catch(() => emptyOcr)
      : Promise.resolve(emptyOcr)
    const applyOcr = (ocr: OcrSignals): void => {
      ocrNumbers = ocr.numbers.length > 0 ? ocr.numbers : undefined
      ocrStates = ocr.states.length > 0 ? ocr.states : undefined
    }

    if (config.verifyExtraction) {
      // Two independent passes in parallel: same wall-clock, double the tokens.
      // reconcile-extraction cross-checks them (and OCR) to catch misreads.
      try {
        const [primary, verify, ocr] = await Promise.all([runOnce(), runOnce(), ocrTask])
        rawModelText = primary
        verifyModelText = verify
        applyOcr(ocr)
      } catch (err) {
        if (!isTimeoutError(err)) throw err
        // Keep the pipeline completing under heavy multi-copy inputs:
        // downgrade to one medium-effort pass if dual high-effort timed out.
        console.warn(
          `[extract] dual-pass timed out for document ${params.ctx.documentId}; retrying single-pass`
        )
        rawModelText = await runOnce('medium')
      }
    } else {
      // Default: one stable pass + deterministic OCR numeric/state cross-check.
      try {
        const [primary, ocr] = await Promise.all([runOnce('high'), ocrTask])
        rawModelText = primary
        applyOcr(ocr)
        // Selective verification: spend a 2nd pass ONLY when the 1st looks
        // uncertain (OCR disagreement, low confidence, missing state, bad Box 12
        // code, or a W-2 payroll ratio that doesn't reconcile). Clean documents
        // stay single-pass, so this buys dual-pass accuracy without paying for it
        // on every document.
        if (
          config.selectiveVerify &&
          warrantsVerification({
            rawModelText,
            formType: params.ctx.formType,
            ocrNumbers,
            ocrStates,
          })
        ) {
          try {
            verifyModelText = await runOnce('high')
          } catch (err) {
            if (!isTimeoutError(err)) throw err
            console.warn(
              `[extract] selective verification pass timed out for document ${params.ctx.documentId}; keeping single-pass result`
            )
          }
        }
      } catch (err) {
        if (!isTimeoutError(err)) throw err
        console.warn(
          `[extract] single-pass high-effort timed out for document ${params.ctx.documentId}; retrying medium-effort`
        )
        const [primary, ocr] = await Promise.all([
          runOnce('medium'),
          ocrTask.catch(() => emptyOcr),
        ])
        rawModelText = primary
        applyOcr(ocr)
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'LLM extraction request failed'
    await markExtractionFailed(params.ctx.documentId, error).catch(() => {})
    return { ok: false, error }
  }

  return runExtraction({ ctx: params.ctx, rawModelText, verifyModelText, ocrNumbers, ocrStates })
}
