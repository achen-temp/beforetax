import type { DocumentType } from '@/lib/tax/document-types'
import type { FieldDefinition, FormSchema } from '@/lib/tax/field-schemas'
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

MULTIPLE COPIES & PAGES (critical for W-2 and similar forms)
- A single wage/tax statement is usually printed as several copies (e.g. W-2 Copy B "Federal", Copy C, Copy 2 "State/City", Copy D) and may span multiple pages or repeat within one page. These copies are the SAME form for the SAME employee — NOT separate forms. Read ALL of them before answering.
- Scalar money boxes (e.g. W-2 boxes 1-11) are identical on every copy. Report each once. NEVER add copies together or you will double- or triple-count.
- State/local sections are frequently split across copies: the Federal copy often leaves state boxes 15-20 blank, while a separate State/City copy shows them — and when there are two states, each state commonly appears on its own copy. You MUST scan every copy/page and UNION all DISTINCT state and locality rows you find anywhere in the document.
- Deduplicate reprints: if the exact same state/locality with the same amounts appears on multiple copies, include it only once. If a state appears on one copy and a different state on another, include BOTH.

VALUE FORMATTING
- Numbers: plain number, no currency symbols or thousands separators ("$1,234.56" -> 1234.56).
- Negative amounts: parentheses "(1,200)" or a leading minus mean negative (-1200).
- Dates: ISO "YYYY-MM-DD". If only a year is printed, use "YYYY-01-01".
- Text: exactly as printed, trimmed. Preserve EIN/TIN formatting (e.g. "12-3456789").
- SSN/TIN on the recipient/employee/borrower: transcribe as printed. If the form shows the FULL number, return the full number. If digits are masked (X, *, •, etc.), keep the mask and only the visible trailing digits (usually last 4) — never invent hidden digits.

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
- recipient_tin_last4: last 4 digits of the recipient SSN/TIN only (whether the form is masked or shows a full number).
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
  const hint = f.hint ? ` [${f.hint}]` : ''
  if (f.slots) {
    const keys = f.slots.map((s) => `"${s}"`).join(', ')
    return `  • ${f.key} [fixed slots]${box}: ${f.label}${hint} — return an object with a key for EACH physical line (${keys}), in order. Each slot is { "code": <printed code/label|null>, "value": <${f.type}|null> }. Fill empty lines with null for both; never omit a slot or shift entries.`
  }
  const repeating = f.repeating
    ? ' — REPEATING: return an array of { "code": string, "value": number|null }'
    : ''
  return `  • ${f.key} [${f.type}]${box}: ${f.label}${hint}${repeating}`
}

/** JSON value shape for a field in the output template. */
function renderShapeValue(f: FieldDefinition): string {
  if (f.type === 'group' && f.fields) {
    const sub = f.fields.map((s) => `"${s.key}": <${s.type}|null>`).join(', ')
    return `{ "value": [ { ${sub} } ], "confidence": <0-1> }`
  }
  if (f.slots) {
    const slotShape = f.slots
      .map((s) => `"${s}": { "code": <string|null>, "value": <${f.type}|null> }`)
      .join(', ')
    return `{ "value": { ${slotShape} }, "confidence": <0-1> }`
  }
  if (f.repeating) {
    return `{ "value": [ { "code": <string>, "value": <number|null> } ], "confidence": <0-1> }`
  }
  return `{ "value": <${f.type}|null>, "confidence": <0-1> }`
}

/** The exact JSON envelope the model must return, generated from the schema so
 * the enforced json_schema, the prompt, and the DB rows always agree. */
function renderOutputTemplate(formType: DocumentType, schema: FieldDefinition[]): string {
  const schemaShape = schema
    .filter((f) => !f.reserved)
    .map((f) => `    "${f.key}": ${renderShapeValue(f)}`)
    .join(',\n')
  return `Return exactly this JSON shape:
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
}`
}

/**
 * Per-form extraction user prompt. Field keys, labels, and types come from
 * FIELD_SCHEMAS so the output lines up 1:1 with document_fields rows. Box
 * numbers are attached server-side from the schema (deterministic), so the
 * model is NOT asked to return them. W-2 uses a dedicated, box-by-box prompt
 * (buildW2UserPrompt); Phase-1 information returns (1099-*, 1098*, SSA-1099,
 * 1095-A) use the generic schema-driven prompt plus optional schema.notes.
 */
export function buildExtractionUserPrompt(formType: DocumentType): string {
  const schema = getFormSchema(formType)
  if (!schema) {
    throw new Error(`No field schema defined for form type: ${formType}`)
  }
  if (formType === 'w2') return buildW2UserPrompt()
  return buildGenericUserPrompt(formType, schema)
}

function buildGenericUserPrompt(formType: DocumentType, schema: FormSchema): string {
  const fieldSpec = schema.fields.filter((f) => !f.reserved).map(renderFieldSpec).join('\n')

  const formNotes =
    schema.notes && schema.notes.length > 0
      ? `\nForm-specific guidance for ${schema.label} — follow carefully:\n${schema.notes
          .map((n) => `- ${n}`)
          .join('\n')}\n`
      : ''

  return `Expected form type: ${schema.label} (${formType})

Box numbers are shown only for your reference — do NOT return them.
Extract these fields using the exact keys shown:
${fieldSpec}
${formNotes}
${renderOutputTemplate(formType, schema.fields)}

Reminders:
- If this is not a ${formType}, set form_type_mismatch true and leave field values null.
- For group fields (e.g. state/local tax): return ONE object per distinct printed row. If a form reports NJ, NY and PA, return three separate objects — never merge states or concatenate their values. Return [] if the section is blank.
- For fixed-slot fields: return an object with a key for EVERY slot ("a","b","c","d"), one per physical printed line and in order. Read each line independently; put null in both "code" and "value" for blank lines. Do NOT skip, merge, or shift lines, and never use the slot letter as the code.
- Scan EVERY copy and page: this document may contain multiple copies of the same form. Money boxes repeat identically across copies (report once, never sum), while state/local rows are often split across different copies. Union all distinct state/local rows found anywhere, and drop exact duplicate reprints.
- document_identity is used to link corrected/duplicate versions of the same form. For recipient_tin_last4 and account_number_last4, store ONLY the last 4 visible digits (whether the form was masked or showed a full number).
- printed_tax_year: only the year explicitly printed on the form; never infer from dates. Use null if absent.
- Values must be printed on the document; use null when absent; never calculate or infer.`
}

/**
 * Dedicated Form W-2 extraction prompt. W-2s are dense, printed as several
 * copies, and split their state/local rows across copies, so they get a
 * box-by-box walkthrough instead of the generic field list. The exact output
 * keys and JSON envelope are still generated from FIELD_SCHEMAS so this prompt
 * can never drift from the json_schema / flatten layer.
 */
function buildW2UserPrompt(): string {
  const schema = getFormSchema('w2')!
  const fieldSpec = schema.fields.filter((f) => !f.reserved).map(renderFieldSpec).join('\n')

  return `Expected form type: ${schema.label} (w2)

You are a W-2 specialist. Read this Form W-2 box by box and transcribe EXACTLY what is printed. Confirm it is a W-2 first; if it is any other form, set "form_type_mismatch": true, leave all fields null, and stop.

HOW W-2 COPIES WORK (read this before extracting)
- One W-2 is printed as several copies: Copy B "Federal", Copy C, Copy 2 "State/City", Copy D. They may be stacked on one page or spread across pages. Every copy is the SAME employee — never treat a copy as a second W-2.
- Boxes 1-14 (wages, taxes, box 12/13/14) are IDENTICAL on every copy. Read them once from the clearest copy. NEVER add copies together.
- Boxes 15-20 (state/local) are frequently DIFFERENT per copy: the Federal copy often leaves them blank, and when there are two states each state usually appears on its own copy. You MUST scan every copy and UNION all distinct state and local rows.

CROSS-COPY VERIFICATION (do this before finalizing numbers)
- After reading every copy, CROSS-CHECK values that reprint across copies (Box 1–14, and any state/local row that appears on more than one copy). Prefer a value that appears consistently on 2+ copies.
- If two clear copies disagree on the same box (e.g. Box 1 differs), keep the clearer reading but set that field's confidence ≤ 0.55 and add "illegible_values" to warnings — do not average or invent a third number.
- State rows (15–17): keep NJ and PA (etc.) as SEPARATE entries. Never merge two states' Box 16/17 into one row. Drop only exact duplicate reprints of the same state + same amounts.
- Box 13: read the checkbox COLUMN carefully on the clearest copy; unmarked = "false", marked = "true".
- Do not "fix" unusual but clearly printed values (e.g. two Box 12 lines both coded DD with different amounts) — transcribe as printed.

BOX-BY-BOX GUIDE (return every key below; use null for any box that is blank)
- Identity: tax_year (the 4-digit year printed on the form, e.g. 2025 — usually top-right or in the form title), employee_name (box e, the person the W-2 is for), employee_ssn (box a — transcribe EXACTLY as printed: full SSN if unmasked; if masked with X/*/•, return the masked form with visible last 4 only; never invent hidden digits), employer_name (box c), employer_ein (box b). document_identity.recipient_* mirrors the employee side; recipient_tin_last4 is always the last 4 digits only (for matching).
- Wages & taxes: wages (box 1), federal_tax_withheld (2), social_security_wages (3), social_security_tax_withheld (4), medicare_wages (5), medicare_tax_withheld (6), social_security_tips (7), allocated_tips (8), dependent_care_benefits (10), nonqualified_plans (11). Transcribe each amount digit-for-digit including the decimal; re-read once to guard against transposed digits (e.g. 137,264.26 vs 137,246.26).
- Box 12 (box12): exactly four physical lines 12a/12b/12c/12d. Return an object with keys "a","b","c","d" in order. For each line put the printed IRS CODE (D, DD, W, C, AA, ...) in "code" and its amount in "value". The letters a-d are line POSITIONS, never the code. Blank line -> both null. Do not shift entries up to fill earlier slots.
- Box 13 checkboxes: statutory_employee, retirement_plan, third_party_sick_pay — return "true" if the box is marked, else "false".
- Box 14 (box14_other): up to four "Other" lines 14a-14d. Return an object with keys "a","b","c","d" in order; put the printed left-side label/description (e.g. SUI, SDI, NJVPDI) in "code" and the amount in "value". Blank line -> both null. Keep each line separate; never merge lines.
- State rows (state_tax, boxes 15-17): one object PER STATE. Each state's state_wages (16) and state_tax_withheld (17) belong to that state's own line — read them from the same row as the state code, never reuse another state's amounts and never substitute box 1 for box 16. Union states found across all copies; drop exact duplicate reprints. If a copy prints "All states" as a placeholder AND a concrete state (NJ, PA) also appears, keep the concrete states.
- Local rows (local_tax, boxes 18-20): one object per locality (local_wages 18, local_tax_withheld 19, locality_name 20).

Exact output keys and shapes:
${fieldSpec}

${renderOutputTemplate('w2', schema.fields)}

Reminders:
- Return EVERY field key above, and for box12/box14 every slot "a"-"d"; a box that is blank on the form is null (not omitted).
- Money boxes 1-14 are read ONCE and never summed across copies; state/local rows are UNIONED across copies.
- Cross-check reprinted amounts across copies before locking the answer.
- Values must be printed on the document; use null when absent; never calculate, infer, or give tax advice.`
}

/**
 * @deprecated Use EXTRACTION_SYSTEM_PROMPT + buildExtractionUserPrompt for the
 * system/user split. Kept for callers that need a single combined string.
 */
export function buildExtractionPrompt(formType: DocumentType): string {
  return `${EXTRACTION_SYSTEM_PROMPT}\n\n${buildExtractionUserPrompt(formType)}`
}
