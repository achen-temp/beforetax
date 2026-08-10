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
  /** document_fields.id — present only for real (non-placeholder) rows; the
   * handle a correction UI edits/verifies against. */
  fieldId?: string
  /** Storage type driving which value column an edit writes to. */
  dataType?: string
  /** Raw (unformatted) editable value for the edit input. */
  rawValue?: string
  /** CPA has signed this value off as correct. */
  isVerified?: boolean
  /** The taxpayer hand-corrected this value; pending CPA review. */
  clientEdited?: boolean
  /** Owning document — needed to create a row for a blank box on first edit. */
  documentId?: string
  /** Canonical field key (document_fields.field_key) for create-on-edit. */
  fieldKey?: string
  /** Slot/group line index this row maps to (create-on-edit). */
  lineIndex?: number
  /** Box-12/14 style code carried on the row, if any. */
  code?: string | null
  /** Specialized editor: 'state' | 'yesno'. */
  inputType?: 'state' | 'yesno'
  /** Coded slot (box 12/14): edits a code + amount together. */
  codeInput?: 'w2box12' | 'text'
  /** An empty box that can be filled in (creates a new field on save). */
  createable?: boolean
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
  /** Multi-form split (or its cross-validation) was ambiguous — needs a human look. */
  segmentationUncertain: boolean
  /** MIME type of the stored original, for the review viewer (PDF vs image). */
  mimeType: string
  /** 1-based pages of the parent file this doc covers (segmented children). */
  pageNumbers: number[] | null
  /** Set on a segmented child; the container it was split from. */
  parentDocumentId: string | null
  /** Editable/verifiable rows on this document (excludes empty placeholders). */
  verifiableCount: number
  /** How many of those rows a CPA has signed off. */
  verifiedCount: number
  /** Skipped by a CPA/client: stored + viewable, but not used anywhere. */
  excluded: boolean
  /** The tax year printed on the form (W-2), if extracted. */
  taxYearOnForm: number | null
  /** The printed year differs from the return year — confirm it belongs here. */
  yearMismatch: boolean
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
  /** Skipped documents — surfaced separately so they can be restored. */
  excludedDocuments: TaxDataDocument[]
}

/** Minimal shapes the builder needs from the DB. */
export interface DocumentRecord {
  id: string
  file_name: string
  file_type: string
  extraction_status: string
  segmentation_uncertain?: boolean
  created_at: string
  mime_type?: string
  page_numbers?: number[] | null
  parent_document_id?: string | null
  excluded_at?: string | null
}

export interface FieldRecord {
  id: string
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
  is_verified?: boolean
  client_edited?: boolean
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

/** The raw editable value (plain string) for a row's edit input, distinct from
 * the formatted display value. */
function rawValue(rec: FieldRecord): string {
  if (rec.data_type === 'number' && rec.value_number !== null) return String(rec.value_number)
  if (rec.data_type === 'date' && rec.value_date) return rec.value_date
  if (rec.value_text !== null) return rec.value_text
  if (rec.value_number !== null) return String(rec.value_number)
  if (rec.value_date) return rec.value_date
  return ''
}

function toRow(field: FieldDefinition, rec: FieldRecord, labelOverride?: string): TaxFieldRow | null {
  const value = formatValue(rec)
  if (value === null) return null
  const label =
    labelOverride ??
    (field.codeInput ? labelForCode(field.codeInput, rec.code, field.label) : field.label)
  return {
    label,
    box: rec.box ?? field.box ?? null,
    value,
    confidence: rec.confidence,
    needsReview: rec.confidence !== null && rec.confidence < REVIEW_CONFIDENCE_THRESHOLD,
    fieldId: rec.id,
    dataType: rec.data_type,
    rawValue: rawValue(rec),
    isVerified: rec.is_verified ?? false,
    clientEdited: rec.client_edited ?? false,
    documentId: rec.document_id,
    fieldKey: rec.field_key,
    lineIndex: rec.line_index,
    code: rec.code,
    inputType: field.inputType,
    codeInput: field.codeInput,
  }
}

/** Metadata that lets a blank box be filled in (a new field row is created on
 * first edit). Omitted for boxes we don't support inline-creating yet. */
interface CreateMeta {
  documentId: string
  fieldKey: string
  lineIndex: number
  dataType: string
  code?: string | null
  inputType?: 'state' | 'yesno'
  codeInput?: 'w2box12' | 'text'
}

/** Display label derived from a Box 12/14 code. Field key stays fixed. */
export function labelForCode(
  codeInput: 'w2box12' | 'text' | undefined,
  code: string | null | undefined,
  fallback: string
): string {
  const c = (code ?? '').trim()
  if (!c) return fallback
  if (codeInput === 'w2box12') return `Code ${c.toUpperCase()}`
  if (codeInput === 'text') return c
  return fallback
}

/** Placeholder row for a box that exists on the form but has no extracted value.
 * When `meta` is supplied the row becomes editable (fills in on save). */
function emptyRow(label: string, box: string | null, meta?: CreateMeta): TaxFieldRow {
  const base: TaxFieldRow = { label, box, value: '', confidence: null, needsReview: false, isEmpty: true }
  if (!meta) return base
  return {
    ...base,
    createable: true,
    rawValue: '',
    documentId: meta.documentId,
    fieldKey: meta.fieldKey,
    lineIndex: meta.lineIndex,
    dataType: meta.dataType,
    code: meta.code ?? null,
    inputType: meta.inputType,
    codeInput: meta.codeInput,
  }
}

/** Reconstruct display groups for one document from its flattened field rows,
 * using the form schema as the source of truth for order and labels. When the
 * schema opts into `showEmptyBoxes` (and the document finished extracting), the
 * full box skeleton is rendered — empty boxes appear as muted placeholders so
 * nothing looks silently dropped. */
function buildGroups(
  formType: DocumentType,
  records: FieldRecord[],
  showEmpty: boolean,
  docId: string
): TaxFieldGroup[] {
  const schema = getFormSchema(formType)
  if (!schema) return []

  const main: TaxFieldRow[] = []
  const groups: TaxFieldGroup[] = []

  for (const field of schema.fields) {
    if (field.type === 'group' && field.fields) {
      buildGroupField(field, records, showEmpty, groups, docId)
    } else if (field.slots) {
      buildSlotField(field, records, showEmpty, main, docId)
    } else if (field.repeating) {
      buildRepeatingField(field, records, showEmpty, main)
    } else {
      buildSimpleField(field, records, showEmpty, main, docId)
    }
  }

  return main.length > 0 ? [{ title: null, rows: main }, ...groups] : groups
}

function buildSimpleField(
  field: FieldDefinition,
  records: FieldRecord[],
  showEmpty: boolean,
  main: TaxFieldRow[],
  docId: string
): void {
  const rec = records.find((r) => r.field_key === field.key)
  const row = rec ? toRow(field, rec) : null
  if (row) main.push(row)
  else if (showEmpty)
    main.push(
      emptyRow(field.label, field.box ?? null, {
        documentId: docId,
        fieldKey: field.key,
        lineIndex: 0,
        dataType: field.type as string,
        inputType: field.inputType,
      })
    )
}

/** Slotted field (box 12/14). `alwaysShowSlots` fields render every slot with its
 * positional box label (12a–12d / 14a–14d). Empty slots with `codeInput` are
 * createable so reviewers can fill code + amount without renaming the field key. */
function buildSlotField(
  field: FieldDefinition,
  records: FieldRecord[],
  showEmpty: boolean,
  main: TaxFieldRow[],
  docId: string
): void {
  const slots = field.slots ?? []
  const byIndex = new Map<number, FieldRecord>()
  for (const r of records.filter((r) => r.field_key === field.key)) byIndex.set(r.line_index, r)

  if (field.alwaysShowSlots) {
    slots.forEach((slot, i) => {
      const boxLabel = `${field.box ?? ''}${slot}`
      const rec = byIndex.get(i)
      const row = rec ? toRow(field, rec) : null
      if (row) main.push({ ...row, box: boxLabel })
      else if (showEmpty) {
        const meta = field.codeInput
          ? {
              documentId: docId,
              fieldKey: field.key,
              lineIndex: i,
              dataType: field.type as string,
              codeInput: field.codeInput,
            }
          : undefined
        main.push(emptyRow(field.label, boxLabel, meta))
      }
    })
    return
  }

  const recs = [...byIndex.values()].sort((a, b) => a.line_index - b.line_index)
  if (recs.length === 0) {
    if (showEmpty) main.push(emptyRow(field.label, field.box ?? null))
    return
  }
  recs.forEach((rec) => {
    const row = toRow(field, rec)
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
  groups: TaxFieldGroup[],
  docId: string
): void {
  if (!field.fields) return
  const subKeys = new Set(field.fields.map((f) => f.key))
  const lineIndexes = [
    ...new Set(records.filter((r) => subKeys.has(r.field_key)).map((r) => r.line_index)),
  ].sort((a, b) => a - b)
  const base = groupBaseTitle(field)

  // `createLi` is the line_index a blank entry's rows are created against, so a
  // trailing blank slot always appends the *next* entry (e.g. add a 2nd state).
  const renderEntry = (li: number | null, i: number, createLi: number): void => {
    const rows: TaxFieldRow[] = []
    for (const sub of field.fields!) {
      const rec = li !== null ? records.find((r) => r.field_key === sub.key && r.line_index === li) : undefined
      const row = rec ? toRow(sub, rec) : null
      if (row) rows.push(row)
      else if (showEmpty)
        rows.push(
          emptyRow(sub.label, sub.box ?? null, {
            documentId: docId,
            fieldKey: sub.key,
            lineIndex: li ?? createLi,
            dataType: sub.type as string,
            inputType: sub.inputType,
          })
        )
    }
    if (rows.length > 0) groups.push({ title: `${base} ${i + 1}`, rows })
  }

  if (lineIndexes.length === 0) {
    if (showEmpty) renderEntry(null, 0, 0)
  } else {
    lineIndexes.forEach((li, i) => renderEntry(li, i, li))
    // One blank entry after the real ones so another state/locality can be added.
    if (showEmpty) renderEntry(null, lineIndexes.length, Math.max(...lineIndexes) + 1)
  }
}

function groupBaseTitle(field: FieldDefinition): string {
  if (field.key === 'state_tax') return 'State'
  if (field.key === 'local_tax') return 'Locality'
  return field.label
}

/** Pull a 4-digit year out of a raw field value, or null. */
function parseFormYear(raw: string | undefined): number | null {
  if (!raw) return null
  const m = raw.match(/\b(19|20)\d{2}\b/)
  return m ? Number(m[0]) : null
}

function buildDocument(
  doc: DocumentRecord,
  fieldsByDoc: Map<string, FieldRecord[]>,
  returnYear: number
): TaxDataDocument {
  const formType = isDocumentType(doc.file_type) ? doc.file_type : 'unknown'
  const records = fieldsByDoc.get(doc.id) ?? []
  // Only draw the full empty-box skeleton once extraction is done; a processing
  // or failed doc shouldn't flash a blank form.
  const showEmpty =
    doc.extraction_status === 'complete' && (getFormSchema(formType)?.showEmptyBoxes ?? false)
  const groups = buildGroups(formType, records, showEmpty, doc.id)
  const allRows = groups.flatMap((g) => g.rows)

  // Year check: if the form's printed year disagrees with the return year, flag
  // the doc and mark the tax_year row for verification so it stands out.
  let taxYearOnForm: number | null = null
  let yearMismatch = false
  const yearRow = allRows.find((r) => r.fieldKey === 'tax_year')
  if (yearRow) {
    taxYearOnForm = parseFormYear(yearRow.rawValue ?? yearRow.value)
    if (taxYearOnForm !== null && taxYearOnForm !== returnYear) {
      yearMismatch = true
      yearRow.needsReview = true
    }
  }

  const reviewCount = allRows.filter((r) => r.needsReview).length
  const verifiableRows = allRows.filter((r) => r.fieldId)
  return {
    id: doc.id,
    fileName: doc.file_name,
    formType,
    formLabel: documentTypeLabel(formType),
    status: doc.extraction_status,
    uploadedAt: doc.created_at,
    groups,
    reviewCount,
    segmentationUncertain: doc.segmentation_uncertain ?? false,
    mimeType: doc.mime_type ?? 'application/octet-stream',
    pageNumbers: doc.page_numbers ?? null,
    parentDocumentId: doc.parent_document_id ?? null,
    verifiableCount: verifiableRows.length,
    verifiedCount: verifiableRows.filter((r) => r.isVerified).length,
    excluded: !!doc.excluded_at,
    taxYearOnForm,
    yearMismatch,
  }
}

/** Every non-skipped document in on-screen order (checklist sections, then extras).
 * Drives the "review one by one" queue on the review screen. */
export function orderedDocuments(view: TaxDataView): TaxDataDocument[] {
  return [...view.sections.flatMap((s) => s.documents), ...view.additionalDocuments]
}

/** Locate a single document within an assembled view (for the review screen). */
export function findDocument(view: TaxDataView, docId: string): TaxDataDocument | null {
  for (const section of view.sections) {
    const found = section.documents.find((d) => d.id === docId)
    if (found) return found
  }
  return (
    view.additionalDocuments.find((d) => d.id === docId) ??
    view.excludedDocuments.find((d) => d.id === docId) ??
    null
  )
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

  const built = input.documents.map((d) => buildDocument(d, fieldsByDoc, input.taxYear))
  // Skipped docs are set aside; they don't feed the checklist or "additional".
  const active = built.filter((d) => !d.excluded)
  const excludedDocuments = built.filter((d) => d.excluded)
  const usedDocIds = new Set<string>()

  const checklistTypes = new Set(input.checklist.map((c) => c.type))

  const sections: TaxChecklistSection[] = input.checklist.map((item) => {
    const docs = active.filter((d) => d.formType === item.type)
    docs.forEach((d) => usedDocIds.add(d.id))
    return {
      type: item.type,
      label: documentTypeLabel(item.type),
      status: item.status,
      documents: docs,
    }
  })

  const additionalDocuments = active.filter(
    (d) => !usedDocIds.has(d.id) && !checklistTypes.has(d.formType)
  )

  return {
    taxYear: input.taxYear,
    hasChecklist: input.checklist.length > 0,
    sections,
    additionalDocuments,
    excludedDocuments,
  }
}
