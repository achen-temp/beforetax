import type { DocumentType } from '@/lib/tax/document-types'
import { isDocumentType } from '@/lib/tax/document-types'
import { documentTypeLabel } from '@/lib/tax/document-type-labels'
import { getFormSchema, type FieldDefinition } from '@/lib/tax/field-schemas'

/** Fields below this confidence are flagged for CPA/client verification. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.9

/** A single extracted value, ready to render. */
export interface TaxFieldRow {
  label: string
  box: string | null
  value: string
  confidence: number | null
  needsReview: boolean
  /** True when the box exists on the form but no value was extracted. Shown as a
   * muted placeholder so the reader sees "confirmed empty", not "dropped". */
  isEmpty?: boolean
}

/** A titled group of rows. `title` is null for a form's main section, or e.g.
 * "State 1" for a repeating group entry. */
export interface TaxFieldGroup {
  title: string | null
  rows: TaxFieldRow[]
}

export interface TaxDataDocument {
  id: string
  fileName: string
  formType: string
  formLabel: string
  status: string
  uploadedAt: string
  groups: TaxFieldGroup[]
  /** Count of extracted values flagged for verification (low confidence). */
  reviewCount: number
}

export interface TaxChecklistSection {
  type: string
  label: string
  status: 'received' | 'missing' | 'pending'
  documents: TaxDataDocument[]
}

export interface TaxDataView {
  taxYear: number
  hasChecklist: boolean
  sections: TaxChecklistSection[]
  additionalDocuments: TaxDataDocument[]
}

/** Minimal shapes the builder needs from the DB. */
export interface DocumentRecord {
  id: string
  file_name: string
  file_type: string
  extraction_status: string
  created_at: string
}

export interface FieldRecord {
  document_id: string
  field_key: string
  box: string | null
  line_index: number
  code: string | null
  data_type: string
  value_number: number | null
  value_text: string | null
  value_date: string | null
  confidence: number | null
}

export interface ChecklistItem {
  type: string
  status: 'received' | 'missing' | 'pending'
}

function formatValue(row: FieldRecord): string | null {
  if (row.data_type === 'number' && row.value_number !== null) {
    return row.value_number.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    })
  }
  if (row.data_type === 'date' && row.value_date) return row.value_date
  if (row.value_text !== null && row.value_text.trim() !== '') {
    const t = row.value_text.trim()
    if (t.toLowerCase() === 'true') return 'Yes'
    if (t.toLowerCase() === 'false') return 'No'
    return row.value_text
  }
  // Fall back across columns in case data_type disagrees with the stored column.
  if (row.value_number !== null) return String(row.value_number)
  if (row.value_date) return row.value_date
  return null
}

function toRow(field: FieldDefinition, rec: FieldRecord, labelOverride?: string): TaxFieldRow | null {
  const value = formatValue(rec)
  if (value === null) return null
  return {
    label: labelOverride ?? field.label,
    box: rec.box ?? field.box ?? null,
    value,
    confidence: rec.confidence,
    needsReview: rec.confidence !== null && rec.confidence < REVIEW_CONFIDENCE_THRESHOLD,
  }
}

/** Placeholder row for a box that exists on the form but has no extracted value. */
function emptyRow(label: string, box: string | null): TaxFieldRow {
  return { label, box, value: '', confidence: null, needsReview: false, isEmpty: true }
}

/** Reconstruct display groups for one document from its flattened field rows,
 * using the form schema as the source of truth for order and labels. When the
 * schema opts into `showEmptyBoxes` (and the document finished extracting), the
 * full box skeleton is rendered — empty boxes appear as muted placeholders so
 * nothing looks silently dropped. */
function buildGroups(
  formType: DocumentType,
  records: FieldRecord[],
  showEmpty: boolean
): TaxFieldGroup[] {
  const schema = getFormSchema(formType)
  if (!schema) return []

  const main: TaxFieldRow[] = []
  const groups: TaxFieldGroup[] = []

  for (const field of schema.fields) {
    if (field.type === 'group' && field.fields) {
      buildGroupField(field, records, showEmpty, groups)
    } else if (field.slots) {
      buildSlotField(field, records, showEmpty, main)
    } else if (field.repeating) {
      buildRepeatingField(field, records, showEmpty, main)
    } else {
      buildSimpleField(field, records, showEmpty, main)
    }
  }

  return main.length > 0 ? [{ title: null, rows: main }, ...groups] : groups
}

function buildSimpleField(
  field: FieldDefinition,
  records: FieldRecord[],
  showEmpty: boolean,
  main: TaxFieldRow[]
): void {
  const rec = records.find((r) => r.field_key === field.key)
  const row = rec ? toRow(field, rec) : null
  if (row) main.push(row)
  else if (showEmpty) main.push(emptyRow(field.label, field.box ?? null))
}

/** Slotted field (box 12/14). `alwaysShowSlots` fields (box 12) render every slot
 * with its positional box label (12a-12d), empty ones included when showEmpty.
 * Other slotted fields (box 14) render only the lines that were extracted. */
function buildSlotField(
  field: FieldDefinition,
  records: FieldRecord[],
  showEmpty: boolean,
  main: TaxFieldRow[]
): void {
  const slots = field.slots ?? []
  const byIndex = new Map<number, FieldRecord>()
  for (const r of records.filter((r) => r.field_key === field.key)) byIndex.set(r.line_index, r)

  if (field.alwaysShowSlots) {
    slots.forEach((slot, i) => {
      const boxLabel = `${field.box ?? ''}${slot}`
      const rec = byIndex.get(i)
      const row = rec ? toRow(field, rec, rec.code ? `Code ${rec.code}` : field.label) : null
      if (row) main.push({ ...row, box: boxLabel })
      else if (showEmpty) main.push(emptyRow(field.label, boxLabel))
    })
    return
  }

  const recs = [...byIndex.values()].sort((a, b) => a.line_index - b.line_index)
  if (recs.length === 0) {
    if (showEmpty) main.push(emptyRow(field.label, field.box ?? null))
    return
  }
  recs.forEach((rec) => {
    const row = toRow(field, rec, rec.code ? `${field.label} (${rec.code})` : field.label)
    if (row) main.push(row)
  })
}

function buildRepeatingField(
  field: FieldDefinition,
  records: FieldRecord[],
  showEmpty: boolean,
  main: TaxFieldRow[]
): void {
  const recs = records
    .filter((r) => r.field_key === field.key)
    .sort((a, b) => a.line_index - b.line_index)
  if (recs.length === 0) {
    if (showEmpty) main.push(emptyRow(field.label, field.box ?? null))
    return
  }
  recs.forEach((rec) => {
    const row = toRow(field, rec, rec.code ? `${field.label} (code ${rec.code})` : field.label)
    if (row) main.push(row)
  })
}

/** Group field (state/local). Each entry shows all its sub-boxes (empty ones
 * included when showEmpty). With no entries, one empty skeleton entry is shown. */
function buildGroupField(
  field: FieldDefinition,
  records: FieldRecord[],
  showEmpty: boolean,
  groups: TaxFieldGroup[]
): void {
  if (!field.fields) return
  const subKeys = new Set(field.fields.map((f) => f.key))
  const lineIndexes = [
    ...new Set(records.filter((r) => subKeys.has(r.field_key)).map((r) => r.line_index)),
  ].sort((a, b) => a - b)
  const base = groupBaseTitle(field)

  const renderEntry = (li: number | null, i: number): void => {
    const rows: TaxFieldRow[] = []
    for (const sub of field.fields!) {
      const rec = li !== null ? records.find((r) => r.field_key === sub.key && r.line_index === li) : undefined
      const row = rec ? toRow(sub, rec) : null
      if (row) rows.push(row)
      else if (showEmpty) rows.push(emptyRow(sub.label, sub.box ?? null))
    }
    if (rows.length > 0) groups.push({ title: `${base} ${i + 1}`, rows })
  }

  if (lineIndexes.length === 0) {
    if (showEmpty) renderEntry(null, 0)
  } else {
    lineIndexes.forEach((li, i) => renderEntry(li, i))
  }
}

function groupBaseTitle(field: FieldDefinition): string {
  if (field.key === 'state_tax') return 'State'
  if (field.key === 'local_tax') return 'Locality'
  return field.label
}

function buildDocument(doc: DocumentRecord, fieldsByDoc: Map<string, FieldRecord[]>): TaxDataDocument {
  const formType = isDocumentType(doc.file_type) ? doc.file_type : 'unknown'
  const records = fieldsByDoc.get(doc.id) ?? []
  // Only draw the full empty-box skeleton once extraction is done; a processing
  // or failed doc shouldn't flash a blank form.
  const showEmpty =
    doc.extraction_status === 'complete' && (getFormSchema(formType)?.showEmptyBoxes ?? false)
  const groups = buildGroups(formType, records, showEmpty)
  const reviewCount = groups.reduce(
    (sum, g) => sum + g.rows.filter((r) => r.needsReview).length,
    0
  )
  return {
    id: doc.id,
    fileName: doc.file_name,
    formType,
    formLabel: documentTypeLabel(formType),
    status: doc.extraction_status,
    uploadedAt: doc.created_at,
    groups,
    reviewCount,
  }
}

/**
 * Assemble the client-facing tax-data view: the CPA's required checklist with
 * each received document's extracted fields nested under the matching item, plus
 * any received documents that fall outside the checklist.
 */
export function buildTaxDataView(input: {
  taxYear: number
  checklist: ChecklistItem[]
  documents: DocumentRecord[]
  fields: FieldRecord[]
}): TaxDataView {
  const fieldsByDoc = new Map<string, FieldRecord[]>()
  for (const f of input.fields) {
    const list = fieldsByDoc.get(f.document_id) ?? []
    list.push(f)
    fieldsByDoc.set(f.document_id, list)
  }

  const built = input.documents.map((d) => buildDocument(d, fieldsByDoc))
  const usedDocIds = new Set<string>()

  const checklistTypes = new Set(input.checklist.map((c) => c.type))

  const sections: TaxChecklistSection[] = input.checklist.map((item) => {
    const docs = built.filter((d) => d.formType === item.type)
    docs.forEach((d) => usedDocIds.add(d.id))
    return {
      type: item.type,
      label: documentTypeLabel(item.type),
      status: item.status,
      documents: docs,
    }
  })

  const additionalDocuments = built.filter(
    (d) => !usedDocIds.has(d.id) && !checklistTypes.has(d.formType)
  )

  return {
    taxYear: input.taxYear,
    hasChecklist: input.checklist.length > 0,
    sections,
    additionalDocuments,
  }
}
