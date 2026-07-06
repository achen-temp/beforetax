import { createAdminClient } from '@/lib/supabase/admin'

export async function getCurrentTaxYear(clientId: string, firmId: string) {
  const admin = createAdminClient()
  const currentYear = new Date().getFullYear()

  const { data, error } = await admin
    .from('tax_years')
    .select('id, year, status')
    .eq('client_id', clientId)
    .eq('firm_id', firmId)
    .eq('year', currentYear)
    .single()

  if (error || !data) return null
  return data
}
