import { cookies } from 'next/headers'
import { resolveTaxYear, type TaxYearRow } from '@/lib/supabase/tax-years'
import { defaultTaxYear } from '@/lib/tax/default-tax-year'
import {
  PORTAL_TAX_YEAR_COOKIE,
  PORTAL_TAX_YEAR_EXPLICIT_COOKIE,
  parseTaxYearParam,
} from '@/lib/tax/portal-tax-year-cookie'

/**
 * Resolve the portal session's selected tax year (cookie → filing-season default).
 *
 * A cookie equal to the calendar year is ignored unless the user explicitly
 * chose it in the picker (explicit cookie). That drops the old wrong default
 * (calendar year) without blocking a deliberate early-season selection.
 */
export async function resolvePortalTaxYear(params: {
  clientId: string
  firmId: string
}): Promise<TaxYearRow> {
  const jar = await cookies()
  let requested = parseTaxYearParam(jar.get(PORTAL_TAX_YEAR_COOKIE)?.value)
  const explicit = jar.get(PORTAL_TAX_YEAR_EXPLICIT_COOKIE)?.value === '1'

  const calendarYear = new Date().getFullYear()
  const filingDefault = defaultTaxYear()
  if (requested === calendarYear && requested !== filingDefault && !explicit) {
    requested = null
  }

  return resolveTaxYear({
    clientId: params.clientId,
    firmId: params.firmId,
    requestedYear: requested,
  })
}
