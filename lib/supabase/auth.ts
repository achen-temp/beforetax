import { createClient } from '@/lib/supabase/server'

export async function getFirmId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const { data, error } = await supabase
    .from('cpa_users')
    .select('firm_id')
    .eq('id', user.id)
    .single()

  if (error || !data) throw new Error('Firm not found')

  return data.firm_id
}
