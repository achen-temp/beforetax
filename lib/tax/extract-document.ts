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
import { runExtraction, type ExtractionOutcome } from '@/lib/tax/run-extraction'
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

  const result = await runResponse({ messages, model: params.model })
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
  try {
    rawModelText = await extractDocumentFields({
      formType: params.ctx.formType,
      inputs: params.inputs,
      model: params.model,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : 'LLM extraction request failed'
    await markExtractionFailed(params.ctx.documentId, error).catch(() => {})
    return { ok: false, error }
  }

  return runExtraction({ ctx: params.ctx, rawModelText })
}
