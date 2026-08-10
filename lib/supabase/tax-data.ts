import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTaxYear } from '@/lib/supabase/tax-years'
import {
  buildTaxDataView,
  type ChecklistItem,
  type DocumentRecord,
  type FieldRecord,
  type TaxDataView,
} from '@/lib/tax/build-tax-data'

/**
 * Assemble the extracted-data view for a client's tax year, organized by the
 * CPA's required checklist. Uses the admin client with explicit firm+client
 * scoping (portal clients aren't cpa_users, so RLS doesn't apply to them).
 *
 * `requestedYear` selects which return to show (creates the row if allowed).
 * When omitted, uses the filing-season default / active fallback.
 */
export async function getClientTaxData(
  clientId: string,
  firmId: string,
  requestedYear?: number | null
): Promise<TaxDataView | null> {
  const taxYear = await resolveTaxYear({ clientId, firmId, requestedYear })

  const admin = createAdminClient()

  const { data: taxYearMeta, error: tyError } = await admin
    .from('tax_years')
    .select('id, year, checklist')
    .eq('id', taxYear.id)
    .eq('client_id', clientId)
    .eq('firm_id', firmId)
    .maybeSingle()

  if (tyError || !taxYearMeta) return null

  const [{ data: documents }, { data: fields }] = await Promise.all([
    admin
      .from('documents')
      .select(
        'id, file_name, file_type, extraction_status, segmentation_uncertain, created_at, mime_type, page_numbers, parent_document_id, excluded_at'
      )
      .eq('client_id', clientId)
      .eq('firm_id', firmId)
      .eq('tax_year_id', taxYearMeta.id)
      // Split containers are internal; their child forms carry the data. Skipped
      // docs are still fetched so they can show in a restorable "Excluded" area.
      .eq('is_container', false)
      .order('created_at', { ascending: false }),
    admin
      .from('document_fields')
      .select(
        'id, document_id, field_key, box, line_index, code, data_type, value_number, value_text, value_date, confidence, is_verified, client_edited'
      )
      .eq('firm_id', firmId)
      .eq('tax_year_id', taxYearMeta.id),
  ])

  const checklist = Array.isArray(taxYearMeta.checklist)
    ? (taxYearMeta.checklist as ChecklistItem[])
    : []

  return buildTaxDataView({
    taxYear: taxYearMeta.year,
    checklist,
    documents: (documents ?? []) as DocumentRecord[],
    fields: (fields ?? []) as FieldRecord[],
  })
}
