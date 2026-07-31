import type { FieldDataType } from '@/lib/tax/document-types'
import type { FieldDefinition, FormSchema } from '@/lib/tax/field-schemas'
import type { ExtractionResult } from '@/lib/tax/extraction-result'

/**
 * One flattened row destined for a document_fields insert. The persistence layer
 * adds the document context (firm_id, tax_year_id, document_id, owner, form_type).
 */
export interface DocumentFieldInput {
  box: string | null
  line_index: number
  code: string | null
  field_key: string
  data_type: FieldDataType
  value_number: number | null
  value_text: string | null
  value_date: string | null
  source_json_path: string | null
  confidence: number | null
}

type TypedValue = Pick<DocumentFieldInput, 'value_number' | 'value_text' | 'value_date'>

const EMPTY_TYPED: TypedValue = { value_number: null, value_text: null, value_date: null }

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

/** Coerce a raw model value into the correct typed column. Returns null when the
 * value can't be represented as the expected type (row is then skipped). */
function coerceValue(value: unknown, type: FieldDataType): TypedValue | null {
  if (isBlank(value)) return null

  if (type === 'number') {
    const num = toNumber(value)
    return num === null ? null : { ...EMPTY_TYPED, value_number: num }
  }
  if (type === 'date') {
    const str = String(value).trim()
    return { ...EMPTY_TYPED, value_text: null, value_date: str }
  }
  return { ...EMPTY_TYPED, value_text: String(value).trim() }
}

/** Parse "$1,234.56" / "(1,200)" / 1234 into a JS number, or null if not numeric. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  let s = value.trim()
  if (s === '') return null

  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/[$,\s]/g, '')
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }
  if (!/^\d*\.?\d+$/.test(s)) return null

  const num = Number(s)
  if (!Number.isFinite(num)) return null
  return negative ? -num : num
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/**
 * Flatten a validated ExtractionResult into document_fields rows using the form
 * schema as the source of truth. Handles four field shapes:
 *   - simple:    one row (line_index 0)
 *   - slots:     box-12/14 style object keyed by slot (a-d) -> one row per
 *                non-blank slot (same row shape as repeating)
 *   - repeating: array of { code, value } -> one row per entry
 *   - group:     per-state/locality array of objects -> one row per sub-field,
 *                entries sharing a line_index so a state's boxes stay grouped
 * Rows are only emitted for values actually present (null/blank is skipped).
 */
export function flattenExtraction(result: ExtractionResult, schema: FormSchema): DocumentFieldInput[] {
  const rows: DocumentFieldInput[] = []

  for (const field of schema.fields) {
    const extracted = result.fields[field.key]
    if (!extracted) continue
    const confidence = extracted.confidence ?? null

    if (field.type === 'group' && field.fields) {
      flattenGroup(field, extracted.value, confidence, rows)
    } else if (field.slots) {
      flattenSlots(field, extracted.value, confidence, rows)
    } else if (field.repeating) {
      flattenRepeating(field, extracted.value, confidence, rows)
    } else {
      flattenSimple(field, extracted.value, confidence, rows)
    }
  }

  return rows
}

function flattenSimple(
  field: FieldDefinition,
  value: unknown,
  confidence: number | null,
  rows: DocumentFieldInput[]
): void {
  const typed = coerceValue(value, field.type as FieldDataType)
  if (!typed) return
  rows.push({
    box: field.box ?? null,
    line_index: 0,
    code: null,
    field_key: field.key,
    data_type: field.type as FieldDataType,
    ...typed,
    source_json_path: `fields.${field.key}.value`,
    confidence,
  })
}

function flattenRepeating(
  field: FieldDefinition,
  value: unknown,
  confidence: number | null,
  rows: DocumentFieldInput[]
): void {
  if (!Array.isArray(value)) return
  value.forEach((entry, i) => {
    const obj = asRecord(entry)
    if (!obj) return
    const typed = coerceValue(obj.value, field.type as FieldDataType)
    if (!typed) return
    const code = isBlank(obj.code) ? null : String(obj.code).trim()
    rows.push({
      box: field.box ?? null,
      line_index: i,
      code,
      field_key: field.key,
      data_type: field.type as FieldDataType,
      ...typed,
      source_json_path: `fields.${field.key}.value[${i}]`,
      confidence,
    })
  })
}

/** Fixed-slot field (e.g. box 12 lines a-d): value is an object keyed by slot,
 * each a { code, value } pair. Emits one row per NON-BLANK slot, using the slot
 * position as line_index (blank slots are simply skipped, so no empty rows). */
function flattenSlots(
  field: FieldDefinition,
  value: unknown,
  confidence: number | null,
  rows: DocumentFieldInput[]
): void {
  const obj = asRecord(value)
  if (!obj || !field.slots) return
  field.slots.forEach((slot, i) => {
    const slotObj = asRecord(obj[slot])
    if (!slotObj) return
    const typed = coerceValue(slotObj.value, field.type as FieldDataType)
    if (!typed) return
    const code = isBlank(slotObj.code) ? null : String(slotObj.code).trim()
    rows.push({
      box: field.box ?? null,
      line_index: i,
      code,
      field_key: field.key,
      data_type: field.type as FieldDataType,
      ...typed,
      source_json_path: `fields.${field.key}.value.${slot}`,
      confidence,
    })
  })
}

function flattenGroup(
  field: FieldDefinition,
  value: unknown,
  confidence: number | null,
  rows: DocumentFieldInput[]
): void {
  if (!Array.isArray(value) || !field.fields) return
  value.forEach((entry, i) => {
    const obj = asRecord(entry)
    if (!obj) return
    for (const sub of field.fields!) {
      const typed = coerceValue(obj[sub.key], sub.type as FieldDataType)
      if (!typed) continue
      rows.push({
        box: sub.box ?? null,
        line_index: i,
        code: null,
        field_key: sub.key,
        data_type: sub.type as FieldDataType,
        ...typed,
        source_json_path: `fields.${field.key}.value[${i}].${sub.key}`,
        confidence,
      })
    }
  })
}

/** Mean of the present per-field confidences, rounded to 2 dp (fits numeric(3,2)). */
export function meanFieldConfidence(result: ExtractionResult): number | null {
  const values = Object.values(result.fields)
    .map((f) => f.confidence)
    .filter((c): c is number => typeof c === 'number')
  if (values.length === 0) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.round(mean * 100) / 100
}
