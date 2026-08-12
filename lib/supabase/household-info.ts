import { createAdminClient } from '@/lib/supabase/admin'
import { ensureTaxYear } from '@/lib/supabase/tax-years'
import {
  emptyHouseholdInfo,
  householdFromPriorReturnFields,
  isHouseholdEmpty,
  parseHouseholdInfo,
  type HouseholdInfo,
} from '@/lib/tax/household-info'
import type { ExtractionResult } from '@/lib/tax/extraction-result'

export async function getHouseholdInfo(params: {
  clientId: string
  firmId: string
  year: number
}): Promise<{ taxYearId: string; year: number; info: HouseholdInfo }> {
  const taxYear = await ensureTaxYear(params)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tax_years')
    .select('id, year, household_info')
    .eq('id', taxYear.id)
    .eq('firm_id', params.firmId)
    .maybeSingle()

  if (error) {
    if (/household_info|column|schema cache/i.test(error.message)) {
      throw new Error(
        'Your info isn’t set up yet. Run migration 019_household_info.sql in Supabase.'
      )
    }
    throw new Error('Unable to load your info.')
  }
  if (!data) throw new Error('Tax year not found.')

  return {
    taxYearId: data.id,
    year: data.year,
    info: parseHouseholdInfo(data.household_info),
  }
}

export async function saveHouseholdInfo(params: {
  clientId: string
  firmId: string
  year: number
  info: HouseholdInfo
}): Promise<HouseholdInfo> {
  const taxYear = await ensureTaxYear({
    clientId: params.clientId,
    firmId: params.firmId,
    year: params.year,
  })
  const normalized = parseHouseholdInfo(params.info)
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('tax_years')
    .update({ household_info: normalized })
    .eq('id', taxYear.id)
    .eq('firm_id', params.firmId)
    .select('household_info')
    .maybeSingle()

  if (error) {
    if (/household_info|column|schema cache/i.test(error.message)) {
      throw new Error(
        'Your info isn’t set up yet. Run migration 019_household_info.sql in Supabase.'
      )
    }
    throw new Error('Unable to save your info.')
  }
  if (!data) throw new Error('Tax year not found.')

  // Keep legacy client columns in sync for CPA list / filters.
  await admin
    .from('clients')
    .update({
      filing_status: normalized.filingStatus,
      taxpayer_name: normalized.taxpayerName || null,
      spouse_name: normalized.spouseName || null,
      phone: normalized.phone || null,
    })
    .eq('id', params.clientId)
    .eq('firm_id', params.firmId)

  return parseHouseholdInfo(data.household_info)
}

/** Latest completed prior_return extraction for this tax year, if any. */
export async function findPriorReturnSuggestion(params: {
  clientId: string
  firmId: string
  taxYearId: string
}): Promise<{ documentId: string; fileName: string; suggestion: HouseholdInfo } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documents')
    .select('id, file_name, extracted_data, extraction_status, file_type')
    .eq('client_id', params.clientId)
    .eq('firm_id', params.firmId)
    .eq('tax_year_id', params.taxYearId)
    .eq('file_type', 'prior_return')
    .eq('extraction_status', 'complete')
    .is('excluded_at', null)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !data?.length) return null

  for (const doc of data) {
    const extracted = doc.extracted_data as ExtractionResult | null
    if (!extracted?.fields || extracted.form_type_mismatch) continue
    const suggestion = householdFromPriorReturnFields(extracted.fields, doc.id)
    if (isHouseholdEmpty(suggestion)) continue
    return {
      documentId: doc.id,
      fileName: doc.file_name,
      suggestion,
    }
  }
  return null
}

/** Load saved household info; if empty, offer prior-return prefill (not auto-saved). */
export async function loadYourInfoView(params: {
  clientId: string
  firmId: string
  year: number
}): Promise<{
  year: number
  info: HouseholdInfo
  suggestion: HouseholdInfo | null
  suggestionSource: { documentId: string; fileName: string } | null
}> {
  const { year, info, taxYearId } = await getHouseholdInfo(params)
  if (!isHouseholdEmpty(info)) {
    return { year, info, suggestion: null, suggestionSource: null }
  }

  const prior = await findPriorReturnSuggestion({
    clientId: params.clientId,
    firmId: params.firmId,
    taxYearId,
  })
  if (!prior) {
    return { year, info: emptyHouseholdInfo(), suggestion: null, suggestionSource: null }
  }

  return {
    year,
    info: emptyHouseholdInfo(),
    suggestion: prior.suggestion,
    suggestionSource: { documentId: prior.documentId, fileName: prior.fileName },
  }
}
