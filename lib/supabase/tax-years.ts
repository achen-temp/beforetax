import { createAdminClient } from '@/lib/supabase/admin'
import { defaultTaxYear, selectableTaxYears } from '@/lib/tax/default-tax-year'

export type TaxYearRow = {
  id: string
  year: number
  status: string
}

/**
 * Resolve the tax year a client is actively working on: always the filing-season
 * default (calendar year − 1), creating the row if needed. Legacy years (e.g. a
 * mistaken 2026 row) stay in the picker but are no longer the automatic default.
 */
export async function getActiveTaxYear(
  clientId: string,
  firmId: string
): Promise<TaxYearRow> {
  return ensureTaxYear({ clientId, firmId, year: defaultTaxYear() })
}

/** @deprecated Use getActiveTaxYear — name implied calendar year. */
export async function getCurrentTaxYear(clientId: string, firmId: string) {
  return getActiveTaxYear(clientId, firmId)
}

/** All tax_years rows for a client, newest first. */
export async function listClientTaxYears(
  clientId: string,
  firmId: string
): Promise<TaxYearRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tax_years')
    .select('id, year, status')
    .eq('client_id', clientId)
    .eq('firm_id', firmId)
    .order('year', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as TaxYearRow[]) ?? []
}

/**
 * Years offered in the picker: selectable seasons plus any older years that
 * already have a row (so legacy data remains reachable).
 */
export async function listPickerTaxYears(
  clientId: string,
  firmId: string
): Promise<number[]> {
  const existing = await listClientTaxYears(clientId, firmId)
  const years = new Set<number>([...selectableTaxYears(), ...existing.map((r) => r.year)])
  return [...years].sort((a, b) => b - a)
}

/** Ensure a tax_years row exists for the given year; returns the row. */
export async function ensureTaxYear(params: {
  clientId: string
  firmId: string
  year: number
}): Promise<TaxYearRow> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('tax_years')
    .select('id, year, status')
    .eq('client_id', params.clientId)
    .eq('firm_id', params.firmId)
    .eq('year', params.year)
    .maybeSingle()

  if (existing) return existing

  const { data, error } = await admin
    .from('tax_years')
    .insert({
      client_id: params.clientId,
      firm_id: params.firmId,
      year: params.year,
      status: 'collecting',
    })
    .select('id, year, status')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create tax year')
  return data
}

/**
 * Resolve which tax year to use for reads/uploads.
 * - If `requestedYear` is set and allowed (picker list or existing row), ensure
 *   that row and return it.
 * - Otherwise always use the filing-season default (creating it if needed).
 */
export async function resolveTaxYear(params: {
  clientId: string
  firmId: string
  requestedYear?: number | null
}): Promise<TaxYearRow> {
  const { clientId, firmId, requestedYear } = params

  if (requestedYear != null) {
    const picker = await listPickerTaxYears(clientId, firmId)
    if (picker.includes(requestedYear) || selectableTaxYears().includes(requestedYear)) {
      return ensureTaxYear({ clientId, firmId, year: requestedYear })
    }
  }

  return getActiveTaxYear(clientId, firmId)
}
