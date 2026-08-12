import { getClientById } from '@/lib/supabase/clients'
import { getFirmPortalBrand } from '@/lib/supabase/firms'
import { listPickerTaxYears } from '@/lib/supabase/tax-years'
import { resolvePortalTaxYear } from '@/lib/tax/portal-active-year'

export type PortalSessionView = {
  name: string
  email: string
  initials: string
  taxYear: number
  taxYears: number[]
  firmName: string | null
  logoUrl: string | null
  /** Firm email for “Email documents to” — not the taxpayer’s email. */
  documentIntakeEmail: string | null
}

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Shared portal header/session payload for SSR and `/api/portal/session`. */
export async function loadPortalSessionView(
  clientId: string,
  firmId: string
): Promise<PortalSessionView | null> {
  const client = await getClientById(clientId, firmId)
  if (!client) return null

  const [taxYear, years, brand] = await Promise.all([
    resolvePortalTaxYear({ clientId, firmId }),
    listPickerTaxYears(clientId, firmId),
    getFirmPortalBrand(firmId),
  ])

  return {
    name: client.name,
    email: client.email,
    initials: initialsFromName(client.name),
    taxYear: taxYear.year,
    taxYears: years,
    firmName: brand.firmName,
    logoUrl: brand.logoUrl,
    documentIntakeEmail: brand.documentIntakeEmail,
  }
}
