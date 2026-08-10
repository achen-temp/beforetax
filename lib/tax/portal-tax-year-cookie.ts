/** Cookie holding the portal client's selected filing year. */
export const PORTAL_TAX_YEAR_COOKIE = 'bt_portal_tax_year'
/** Set only when the client explicitly picks a year in the UI. */
export const PORTAL_TAX_YEAR_EXPLICIT_COOKIE = 'bt_portal_tax_year_explicit'

export { parseTaxYearParam } from '@/lib/tax/parse-tax-year'

export function portalTaxYearCookieOptions(maxAge = 60 * 60 * 24 * 400) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}
