import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Manual corrections to extracted field values.
 *
 * Two roles write here with different semantics:
 *   - CPA edit  = professional sign-off. Sets the value AND marks is_verified
 *     (verified_by / verified_at), clearing any pending client-edit flag.
 *   - Client edit = the taxpayer correcting their own data. Sets the value but
 *     leaves is_verified = false and flags client_edited so the CPA re-reviews.
 *
 * Only value_* columns change; documents.extracted_data (the AI snapshot) is never
 * touched, so the original AI read is always recoverable.
 */

export class FieldNotFoundError extends Error {
  constructor() {
    super('FIELD_NOT_FOUND')
    this.name = 'FieldNotFoundError'
  }
}

export class InvalidFieldValueError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidFieldValueError'
  }
}

interface ValueColumns {
  value_number: number | null
  value_text: string | null
  value_date: string | null
}

/** Route a raw string edit into the correct typed column, clearing the others.
 * An empty value clears the field. Throws InvalidFieldValueError on bad input. */
function coerceValueColumns(dataType: string, value: string | null): ValueColumns {
  const cols: ValueColumns = { value_number: null, value_text: null, value_date: null }
  const v = (value ?? '').trim()
  if (v === '') return cols

  if (dataType === 'number') {
    const n = Number(v.replace(/[$,\s]/g, ''))
    if (!Number.isFinite(n)) throw new InvalidFieldValueError('Expected a number')
    cols.value_number = n
  } else if (dataType === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new InvalidFieldValueError('Expected a date (YYYY-MM-DD)')
    cols.value_date = v
  } else {
    cols.value_text = v
  }
  return cols
}

async function loadField(
  fieldId: string,
  firmId: string
): Promise<{ data_type: string; document_id: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('document_fields')
    .select('data_type, document_id')
    .eq('id', fieldId)
    .eq('firm_id', firmId)
    .maybeSingle()
  return data ?? null
}

/**
 * CPA correction / sign-off. When `value` is provided the field is updated and
 * (unless `verified` is explicitly false) marked verified. When only `verified`
 * is provided it toggles the sign-off without changing the value.
 */
export async function updateFieldByCpa(params: {
  fieldId: string
  firmId: string
  cpaUserId: string
  value?: string | null
  /** Box 12/14 code (or description). Does not change field_key. */
  code?: string | null
  verified?: boolean
}): Promise<void> {
  const field = await loadField(params.fieldId, params.firmId)
  if (!field) throw new FieldNotFoundError()

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {}

  if (params.value !== undefined) {
    Object.assign(patch, coerceValueColumns(field.data_type, params.value))
    patch.edited_at = now
    patch.client_edited = false
  }

  if (params.code !== undefined) {
    const c = (params.code ?? '').trim()
    patch.code = c === '' ? null : c
    patch.edited_at = now
    patch.client_edited = false
  }

  // Editing implies confirming, unless the caller explicitly says otherwise.
  const edited = params.value !== undefined || params.code !== undefined
  const verified = params.verified ?? (edited ? true : undefined)
  if (verified !== undefined) {
    patch.is_verified = verified
    patch.verified_by = verified ? params.cpaUserId : null
    patch.verified_at = verified ? now : null
    if (verified) patch.client_edited = false
  }

  if (Object.keys(patch).length === 0) return

  const admin = createAdminClient()
  const { error } = await admin
    .from('document_fields')
    .update(patch)
    .eq('id', params.fieldId)
    .eq('firm_id', params.firmId)
  if (error) throw new Error(error.message)
}

/**
 * Fill in a previously-blank box by creating (or upserting) a document_fields
 * row. Used by the review UI's pencil on empty fields.
 *   - CPA        -> the new value is verified sign-off (is_verified).
 *   - Client     -> flagged client_edited, pending CPA review.
 * Upserts on the (document_id, owner, field_key, box, line_index) unique key so a
 * repeated add just updates the value instead of erroring.
 */
export async function createFieldForDocument(params: {
  documentId: string
  firmId: string
  clientId?: string
  fieldKey: string
  box: string | null
  lineIndex: number
  code: string | null
  dataType: string
  value: string
  cpaUserId?: string
  asClient?: boolean
}): Promise<{ id: string }> {
  const admin = createAdminClient()

  let docQuery = admin
    .from('documents')
    .select('id, owner, file_type, tax_year_id')
    .eq('id', params.documentId)
    .eq('firm_id', params.firmId)
  if (params.clientId) docQuery = docQuery.eq('client_id', params.clientId)
  const { data: doc } = await docQuery.maybeSingle()
  if (!doc) throw new FieldNotFoundError()

  const cols = coerceValueColumns(params.dataType, params.value)
  if (cols.value_number === null && cols.value_text === null && cols.value_date === null) {
    throw new InvalidFieldValueError('Enter a value first')
  }

  // Box 12/14 lines need a code (IRS letter or printed description) with the amount.
  let code = params.code
  if (params.fieldKey === 'box12' || params.fieldKey === 'box14_other') {
    const trimmed = (code ?? '').trim()
    if (!trimmed) {
      throw new InvalidFieldValueError(
        params.fieldKey === 'box12' ? 'Pick a Box 12 code' : 'Enter a Box 14 description'
      )
    }
    code = params.fieldKey === 'box12' ? trimmed.toUpperCase() : trimmed
  }

  const now = new Date().toISOString()
  const owner = (doc as { owner?: string }).owner ?? 'unknown'
  const verifyCols: {
    is_verified: boolean
    verified_by: string | null
    verified_at: string | null
    client_edited: boolean
  } = params.asClient
    ? { is_verified: false, verified_by: null, verified_at: null, client_edited: true }
    : {
        is_verified: true,
        verified_by: params.cpaUserId ?? null,
        verified_at: now,
        client_edited: false,
      }

  const row = {
    firm_id: params.firmId,
    tax_year_id: (doc as { tax_year_id: string }).tax_year_id,
    document_id: params.documentId,
    owner,
    form_type: (doc as { file_type: string }).file_type,
    box: params.box,
    line_index: params.lineIndex,
    code,
    field_key: params.fieldKey,
    data_type: params.dataType,
    ...cols,
    confidence: null,
    edited_at: now,
    ...verifyCols,
  }

  const { data, error } = await admin
    .from('document_fields')
    .upsert(row, { onConflict: 'document_id,owner,field_key,box,line_index' })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create field')
  return { id: data.id as string }
}

/**
 * CPA bulk sign-off: mark every not-yet-verified field on one document as
 * verified. Used by the "Mark all verified" action on a clean extraction.
 * Returns how many rows were newly verified. Scoped to the firm + document.
 */
export async function verifyAllFieldsForDocument(params: {
  documentId: string
  firmId: string
  cpaUserId: string
}): Promise<number> {
  const admin = createAdminClient()

  const { data: doc } = await admin
    .from('documents')
    .select('id')
    .eq('id', params.documentId)
    .eq('firm_id', params.firmId)
    .maybeSingle()
  if (!doc) throw new FieldNotFoundError()

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('document_fields')
    .update({
      is_verified: true,
      verified_by: params.cpaUserId,
      verified_at: now,
      client_edited: false,
    })
    .eq('document_id', params.documentId)
    .eq('firm_id', params.firmId)
    .eq('is_verified', false)
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

/**
 * Client (taxpayer) correction. Updates the value and flags it as a client edit
 * pending CPA review — it never counts as verified.
 */
export async function updateFieldByClient(params: {
  fieldId: string
  firmId: string
  clientId: string
  value?: string | null
  /** Box 12/14 code (or description). Does not change field_key. */
  code?: string | null
}): Promise<void> {
  const field = await loadField(params.fieldId, params.firmId)
  if (!field) throw new FieldNotFoundError()

  // Ensure the field's document actually belongs to this client.
  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('documents')
    .select('id')
    .eq('id', field.document_id)
    .eq('client_id', params.clientId)
    .eq('firm_id', params.firmId)
    .maybeSingle()
  if (!doc) throw new FieldNotFoundError()

  if (params.value === undefined && params.code === undefined) {
    throw new InvalidFieldValueError('Nothing to update')
  }

  const patch: Record<string, unknown> = {
    client_edited: true,
    is_verified: false,
    verified_by: null,
    verified_at: null,
    edited_at: new Date().toISOString(),
  }
  if (params.value !== undefined) {
    Object.assign(patch, coerceValueColumns(field.data_type, params.value))
  }
  if (params.code !== undefined) {
    const c = (params.code ?? '').trim()
    patch.code = c === '' ? null : c
  }

  const { error } = await admin
    .from('document_fields')
    .update(patch)
    .eq('id', params.fieldId)
    .eq('firm_id', params.firmId)
  if (error) throw new Error(error.message)
}
