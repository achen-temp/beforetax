import { z } from 'zod'
import { EXTRACTION_WARNINGS } from '@/lib/tax/extraction-prompt'

/**
 * Runtime validation for the raw JSON the extraction model returns. The prompt
 * (buildExtractionUserPrompt) instructs the shape, but the model output is never
 * trusted — every extraction is parsed and validated here before it touches the
 * database. Field values are kept as `unknown` because their shape varies per
 * form (scalar, box-12 code/value array, or per-state group array); the exact
 * interpretation happens in flatten-extraction.ts against the field schema.
 */

const extractedFieldSchema = z.object({
  value: z.unknown(),
  confidence: z.number().min(0).max(1).nullable().optional(),
})

export type ExtractedField = z.infer<typeof extractedFieldSchema>

const documentIdentitySchema = z
  .object({
    issuer_name: z.string().nullable().optional(),
    recipient_name: z.string().nullable().optional(),
    recipient_tin_last4: z.string().nullable().optional(),
    account_number_last4: z.string().nullable().optional(),
  })
  .partial()

export const extractionResultSchema = z.object({
  form_type: z.string(),
  form_type_mismatch: z.boolean().default(false),
  document_identity: documentIdentitySchema.optional(),
  printed_tax_year: z.number().int().nullable().optional(),
  fields: z.record(z.string(), extractedFieldSchema).default({}),
  // Tolerate unknown warning strings from the model; the UI filters known ones.
  warnings: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
})

export type ExtractionResult = z.infer<typeof extractionResultSchema>
export type ExtractionWarning = (typeof EXTRACTION_WARNINGS)[number]

export type ParsedExtraction =
  | { ok: true; data: ExtractionResult }
  | { ok: false; error: string; raw: string }

/**
 * The system prompt forbids code fences, but models occasionally wrap output
 * anyway. Strip a leading ```json / ``` and trailing ``` before parsing.
 */
function stripJsonFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

/**
 * Parse + validate raw model text into a typed ExtractionResult. Never throws:
 * returns a discriminated result so the caller can mark the document failed and
 * persist the raw text for debugging instead of crashing the request.
 */
export function parseExtractionResult(rawText: string): ParsedExtraction {
  const cleaned = stripJsonFences(rawText)

  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'invalid JSON'
    return { ok: false, error: `Model did not return valid JSON: ${reason}`, raw: rawText }
  }

  const parsed = extractionResultSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    return { ok: false, error: `Extraction JSON failed validation: ${issues}`, raw: rawText }
  }

  return { ok: true, data: parsed.data }
}
