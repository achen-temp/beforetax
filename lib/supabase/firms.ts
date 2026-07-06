import { createClient } from '@/lib/supabase/server'

export async function getFirmForUser(userId: string) {
  const supabase = await createClient()

  const { data: profile, error: profileError } = await supabase
    .from('cpa_users')
    .select('firm_id')
    .eq('id', userId)
    .single()

  if (profileError || !profile) return null

  const { data: firm, error: firmError } = await supabase
    .from('cpa_firms')
    .select('name')
    .eq('id', profile.firm_id)
    .single()

  if (firmError) return { firmId: profile.firm_id, firmName: null }

  return { firmId: profile.firm_id, firmName: firm?.name ?? null }
}
