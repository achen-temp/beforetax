import { z } from 'zod'

/**
 * Runtime validation for the classification model output (see
 * buildClassificationPrompt). Kept separate from field extraction — this only
 * identifies the form type + a few identity hints used to route extraction.
 */

const classificationSchema = z.object({
  form_type: z.string(),
  recipient_name: z.string().nullable().optional(),
  recipient_tin_last4: z.string().nullable().optional(),
  printed_tax_year: z.number().int().nullable().optional(),
  document_quality: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
})

export type Classification = z.infer<typeof classificationSchema>

export type ParsedClassification =
  | { ok: true; data: Classification }
  | { ok: false; error: string }

function stripJsonFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

export function parseClassification(rawText: string): ParsedClassification {
  let json: unknown
  try {
    json = JSON.parse(stripJsonFences(rawText))
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid JSON' }
  }

  const parsed = classificationSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    return { ok: false, error: `Classification failed validation: ${issues}` }
  }
  return { ok: true, data: parsed.data }
}
