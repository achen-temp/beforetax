import type { DocumentType } from '@/lib/tax/document-types'
import type { FieldDefinition } from '@/lib/tax/field-schemas'
import { getFormSchema, getSupportedFormTypes } from '@/lib/tax/field-schemas'

/**
 * Controlled vocabulary for structured extraction warnings. Stored so the CPA
 * dashboard can filter on them instead of parsing free-text notes.
 */
export const EXTRACTION_WARNINGS = [
  'corrected_form',
  'amended_form',
  'prior_year_document',
  'multiple_forms_detected',
  'low_quality_scan',
  'illegible_values',
  'handwritten_values',
  'void_form',
] as const

export type ExtractionWarning = (typeof EXTRACTION_WARNINGS)[number]

/** Legibility of the scan/photo — distinct from model classification confidence. */
export const DOCUMENT_QUALITY = ['high', 'medium', 'low'] as const

export type DocumentQuality = (typeof DOCUMENT_QUALITY)[number]

/**
 * Stable system prompt for extraction. Contains the role and the rigorous
 * anti-hallucination / formatting rules that apply to every tax form. Pair it
 * with buildExtractionUserPrompt(formType) which supplies the field spec.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are a meticulous U.S. tax document data-extraction engine used by CPA firms. Your output feeds directly into tax-preparation software, so accuracy and honesty are more important than completeness.

CORE PRINCIPLES
- Extract ONLY values that are explicitly printed on the document. Never infer, calculate, estimate, or complete missing values.
- If a field is not present, is blank, or you cannot read it, return null for that field. Do not guess.
- A field explicitly printed as 0 (or 0.00) is the number 0, not null. Distinguish "blank" (null) from "zero" (0).
- Do not give tax advice or commentary, and do no math beyond reading printed values.

FORM-TYPE SAFETY (critical)
- You are told which form type to extract. First confirm the document actually IS that form.
- If it is NOT that form type, set "form_type_mismatch": true, leave every field value null, and STOP. Do not force-extract fields from the wrong form.

VALUE FORMATTING
- Numbers: plain number, no currency symbols or thousands separators ("$1,234.56" -> 1234.56).
- Negative amounts: parentheses "(1,200)" or a leading minus mean negative (-1200).
- Dates: ISO "YYYY-MM-DD". If only a year is printed, use "YYYY-01-01".
- Text: exactly as printed, trimmed. Preserve EIN/TIN formatting (e.g. "12-3456789").

CONFIDENCE CALIBRATION (0.0-1.0)
- 0.95-1.0: crisp, digitally-generated text, unambiguous.
- 0.7-0.94: legible scan/photo with minor noise.
- 0.4-0.69: partially obscured, low resolution, or ambiguous placement.
- <0.4: barely legible. Prefer null with a warning over a low-confidence guess on critical numbers.

WARNINGS
- Report document-level issues using ONLY these codes in the "warnings" array: ${EXTRACTION_WARNINGS.join(', ')}.
- Use "notes" only for detail that no warning code captures.

OUTPUT
- Respond with a single valid JSON object only. No markdown, no code fences, no text before or after.`

/**
 * Classification prompt — identify the form type using the controlled
 * vocabulary. Owner is resolved in the backend (never guessed by the model).
 * printed_tax_year is for cross-checking against the portal's tax year only and
 * must never be inferred from dates. document_quality reflects legibility of
 * the scan/photo, not the model's certainty (that is confidence).
 */
export function buildClassificationPrompt(): string {
  const types = getSupportedFormTypes().join(', ')
  return `Classify the tax document. Respond with a single valid JSON object only:
{
  "form_type": one of [${types}, "unknown"],
  "recipient_name": string or null,
  "recipient_tin_last4": string or null,
  "printed_tax_year": number or null,
  "document_quality": one of ["high", "medium", "low"],
  "confidence": number between 0 and 1
}
Rules:
- Base form_type on the form title, official box layout, and issuer. If it is not a recognizable tax form, return "unknown".
- printed_tax_year: return ONLY the tax year explicitly printed on the form. Do NOT infer it from statement dates, mailing dates, or "for year" text on cover pages. If not explicitly printed, return null.
- document_quality: "high" = crisp digital/clean scan; "medium" = readable photo/scan with noise; "low" = blurry, skewed, shadowed, or partially cut off.
- confidence: how certain you are about form_type (separate from document_quality).
No markdown, no explanation.`
}

/** Human-readable field spec bullet, recursing into group sub-fields. */
function renderFieldSpec(f: FieldDefinition): string {
  if (f.type === 'group' && f.fields) {
    const subs = f.fields
      .map((s) => {
        const box = s.box ? ` (box ${s.box})` : ''
        return `      - ${s.key} [${s.type}]${box}: ${s.label}`
      })
      .join('\n')
    return `  • ${f.key} [group, REPEATING — one object per row (e.g. one per state/locality); return [] if none]: ${f.label}\n${subs}`
  }
  const box = f.box ? ` (box ${f.box})` : ''
  const repeating = f.repeating
    ? ' — REPEATING: return an array of { "code": string, "value": number|null }'
    : ''
  return `  • ${f.key} [${f.type}]${box}: ${f.label}${repeating}`
}

/** JSON value shape for a field in the output template. */
function renderShapeValue(f: FieldDefinition): string {
  if (f.type === 'group' && f.fields) {
    const sub = f.fields.map((s) => `"${s.key}": <${s.type}|null>`).join(', ')
    return `{ "value": [ { ${sub} } ], "confidence": <0-1> }`
  }
  if (f.repeating) {
    return `{ "value": [ { "code": <string>, "value": <number|null> } ], "confidence": <0-1> }`
  }
  return `{ "value": <${f.type}|null>, "confidence": <0-1> }`
}

/**
 * Per-form extraction user prompt. Field keys, labels, and types come from
 * FIELD_SCHEMAS so the output lines up 1:1 with document_fields rows. Box
 * numbers are attached server-side from the schema (deterministic), so the
 * model is NOT asked to return them.
 */
export function buildExtractionUserPrompt(formType: DocumentType): string {
  const schema = getFormSchema(formType)
  if (!schema) {
    throw new Error(`No field schema defined for form type: ${formType}`)
  }

  const fieldSpec = schema.fields.map(renderFieldSpec).join('\n')

  const schemaShape = schema.fields
    .map((f) => `    "${f.key}": ${renderShapeValue(f)}`)
    .join(',\n')

  return `Expected form type: ${schema.label} (${formType})

Box numbers are shown only for your reference — do NOT return them.
Extract these fields using the exact keys shown:
${fieldSpec}

Return exactly this JSON shape:
{
  "form_type": "${formType}",
  "form_type_mismatch": <boolean>,
  "document_identity": {
    "issuer_name": <string|null>,
    "recipient_name": <string|null>,
    "recipient_tin_last4": <string|null>,
    "account_number_last4": <string|null>
  },
  "printed_tax_year": <number|null>,
  "fields": {
${schemaShape}
  },
  "warnings": [ <zero or more of: ${EXTRACTION_WARNINGS.join(', ')}> ],
  "notes": <string|null>
}

Reminders:
- If this is not a ${formType}, set form_type_mismatch true and leave field values null.
- For group fields (e.g. state/local tax): return ONE object per printed row. If a W-2 reports NJ, NY and PA, return three separate objects — never merge states or concatenate their values. Return [] if the section is blank.
- document_identity is used to link corrected/duplicate versions of the same form; fill last-4 only for TIN and account number, never full numbers.
- printed_tax_year: only the year explicitly printed on the form; never infer from dates. Use null if absent.
- Values must be printed on the document; use null when absent; never calculate or infer.`
}

/**
 * @deprecated Use EXTRACTION_SYSTEM_PROMPT + buildExtractionUserPrompt for the
 * system/user split. Kept for callers that need a single combined string.
 */
export function buildExtractionPrompt(formType: DocumentType): string {
  return `${EXTRACTION_SYSTEM_PROMPT}\n\n${buildExtractionUserPrompt(formType)}`
}
