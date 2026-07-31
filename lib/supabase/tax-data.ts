import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildTaxDataView,
  type ChecklistItem,
  type DocumentRecord,
  type FieldRecord,
  type TaxDataView,
} from '@/lib/tax/build-tax-data'

/**
 * Assemble the extracted-data view for a client's current tax year, organized by
 * the CPA's required checklist. Uses the admin client with explicit firm+client
 * scoping (portal clients aren't cpa_users, so RLS doesn't apply to them).
 */
export async function getClientTaxData(
  clientId: string,
  firmId: string
): Promise<TaxDataView | null> {
  const admin = createAdminClient()
  const currentYear = new Date().getFullYear()

  const { data: taxYear, error: tyError } = await admin
    .from('tax_years')
    .select('id, year, checklist')
    .eq('client_id', clientId)
    .eq('firm_id', firmId)
    .eq('year', currentYear)
    .single()

  if (tyError || !taxYear) return null

  const [{ data: documents }, { data: fields }] = await Promise.all([
    admin
      .from('documents')
      .select('id, file_name, file_type, extraction_status, created_at')
      .eq('client_id', clientId)
      .eq('firm_id', firmId)
      .eq('tax_year_id', taxYear.id)
      .order('created_at', { ascending: false }),
    admin
      .from('document_fields')
      .select(
        'document_id, field_key, box, line_index, code, data_type, value_number, value_text, value_date, confidence'
      )
      .eq('firm_id', firmId)
      .eq('tax_year_id', taxYear.id),
  ])

  const checklist = Array.isArray(taxYear.checklist)
    ? (taxYear.checklist as ChecklistItem[])
    : []

  return buildTaxDataView({
    taxYear: taxYear.year,
    checklist,
    documents: (documents ?? []) as DocumentRecord[],
    fields: (fields ?? []) as FieldRecord[],
  })
}
